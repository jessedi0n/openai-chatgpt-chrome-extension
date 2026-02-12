importScripts("models.js");

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_MS = 60000;
const LEGACY_CHAT_HISTORY_KEY = "chatHistory";
const MAX_CHAT_SESSIONS = 12;
const MAX_SYSTEM_MESSAGE_LENGTH = 4000;
const MAX_ATTACHMENTS_PER_MESSAGE = 6;
const MAX_ATTACHMENT_DATA_URL_LENGTH = 15 * 1024 * 1024;
const REQUEST_CANCELED_ERROR_MESSAGE = "__REQUEST_CANCELED__";

const {
    STORAGE_KEYS,
    DEFAULT_WEB_SEARCH_ENABLED,
    DEFAULT_ACCENT_COLOR,
    DEFAULT_LANGUAGE_PREFERENCE,
    getValidModelId,
    getValidThinkingLevel,
    getThinkingEffort,
    getValidAccentColor,
    getValidWebSearchEnabled,
    getValidLanguagePreference,
    setLanguagePreference,
    isImageModel,
    supportsThinking,
    supportsWebSearch,
} = OPENAI_MODELS;
const STORAGE_FIELDS = Object.freeze([
    "apiKey",
    STORAGE_KEYS.CHAT_SESSIONS,
    STORAGE_KEYS.ACTIVE_CHAT_ID,
    LEGACY_CHAT_HISTORY_KEY,
]);

let activeRequestContext = null;
const i18nInitializationPromise = initializeLanguagePreference();

chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName !== "local" || !changes || !changes[STORAGE_KEYS.LANGUAGE]) {
        return;
    }

    const languageChange = changes[STORAGE_KEYS.LANGUAGE];
    void setLanguagePreference(getValidLanguagePreference(languageChange.newValue));
});

chrome.runtime.onInstalled.addListener(async function (details) {
    try {
        const existingValues = await getStorageData([
            STORAGE_KEYS.MODEL,
            STORAGE_KEYS.THINKING,
            STORAGE_KEYS.WEB_SEARCH,
            STORAGE_KEYS.ACCENT_COLOR,
            STORAGE_KEYS.SYSTEM_MESSAGE,
            STORAGE_KEYS.LANGUAGE,
            STORAGE_KEYS.CHAT_SESSIONS,
            STORAGE_KEYS.ACTIVE_CHAT_ID,
            LEGACY_CHAT_HISTORY_KEY,
        ]);
        const updates = {};
        const normalizedModelId = getValidModelId(existingValues[STORAGE_KEYS.MODEL]);
        const normalizedThinkingLevel = getValidThinkingLevel(existingValues[STORAGE_KEYS.THINKING], normalizedModelId);
        const normalizedWebSearchEnabled = getValidWebSearchEnabled(existingValues[STORAGE_KEYS.WEB_SEARCH]);
        const normalizedLanguagePreference = getValidLanguagePreference(existingValues[STORAGE_KEYS.LANGUAGE]);
        const normalizedChatState = normalizeChatSessionsState(
            existingValues[STORAGE_KEYS.CHAT_SESSIONS],
            existingValues[STORAGE_KEYS.ACTIVE_CHAT_ID],
            "",
            existingValues[LEGACY_CHAT_HISTORY_KEY],
            false
        );

        if (normalizedModelId !== existingValues[STORAGE_KEYS.MODEL]) {
            updates[STORAGE_KEYS.MODEL] = normalizedModelId;
        }

        if (normalizedThinkingLevel !== existingValues[STORAGE_KEYS.THINKING]) {
            updates[STORAGE_KEYS.THINKING] = normalizedThinkingLevel;
        }

        if (normalizedWebSearchEnabled !== existingValues[STORAGE_KEYS.WEB_SEARCH]) {
            updates[STORAGE_KEYS.WEB_SEARCH] = DEFAULT_WEB_SEARCH_ENABLED;
        }

        if (getValidAccentColor(existingValues[STORAGE_KEYS.ACCENT_COLOR]) !== existingValues[STORAGE_KEYS.ACCENT_COLOR]) {
            updates[STORAGE_KEYS.ACCENT_COLOR] = DEFAULT_ACCENT_COLOR;
        }

        if (typeof existingValues[STORAGE_KEYS.SYSTEM_MESSAGE] !== "string") {
            updates[STORAGE_KEYS.SYSTEM_MESSAGE] = "";
        }

        if (normalizedLanguagePreference !== existingValues[STORAGE_KEYS.LANGUAGE]) {
            updates[STORAGE_KEYS.LANGUAGE] = DEFAULT_LANGUAGE_PREFERENCE;
        }

        if (normalizedChatState.changed) {
            updates[STORAGE_KEYS.CHAT_SESSIONS] = normalizedChatState.sessions;
            updates[STORAGE_KEYS.ACTIVE_CHAT_ID] = normalizedChatState.activeChatId;
        }

        if (Object.keys(updates).length > 0) {
            await setStorageData(updates);
        }

        if (details.reason === "install") {
            chrome.runtime.openOptionsPage();
        }
    } catch (error) {
        console.error(error);
    }
});

chrome.runtime.onMessage.addListener(function (message) {
    if (isUserInputMessage(message)) {
        void handleUserMessage(message.userInput, message.attachments, message.chatId);
        return true;
    }

    if (isRegenerateMessage(message)) {
        void handleRegenerateMessage(message.chatId);
        return true;
    }

    if (isStopMessage(message)) {
        cancelActiveRequest();
        return false;
    }

    return false;
});

function isUserInputMessage(message) {
    return Boolean(message && typeof message.userInput === "string");
}

function isRegenerateMessage(message) {
    return Boolean(message && message.regenerate === true);
}

function isStopMessage(message) {
    return Boolean(message && message.stopResponse === true);
}

async function handleUserMessage(rawUserInput, rawAttachments, rawChatId) {
    const requestContext = startActiveRequest();
    try {
        await i18nInitializationPromise;

        const userInput = rawUserInput.trim();
        const attachments = normalizeAttachments(rawAttachments);
        if (!userInput && attachments.length === 0) {
            return;
        }

        const storageKeys = STORAGE_FIELDS.concat([STORAGE_KEYS.MODEL, STORAGE_KEYS.THINKING, STORAGE_KEYS.WEB_SEARCH, STORAGE_KEYS.SYSTEM_MESSAGE]);
        const storedData = await getStorageData(storageKeys);
        const apiKey = sanitizeApiKey(storedData.apiKey);
        const selection = normalizeSelection(storedData);
        const systemMessage = getSystemMessageContent(storedData[STORAGE_KEYS.SYSTEM_MESSAGE]);
        const chatState = normalizeChatSessionsState(
            storedData[STORAGE_KEYS.CHAT_SESSIONS],
            storedData[STORAGE_KEYS.ACTIVE_CHAT_ID],
            normalizeChatId(rawChatId),
            storedData[LEGACY_CHAT_HISTORY_KEY],
            true
        );
        const chatHistory = buildChatHistory(chatState.activeSession.history, systemMessage, userInput, attachments);

        await persistNormalizedSelection(selection.updates);
        await persistNormalizedChatState(chatState);

        if (!apiKey) {
            throw new Error(getI18nMessage("bgErrorApiKeyMissing", null, "Please add a valid OpenAI API key in settings."));
        }

        if (attachments.length > 0 && isImageModel(selection.modelId)) {
            throw new Error(
                getI18nMessage(
                    "bgErrorAttachmentsUnsupported",
                    null,
                    "Attachments are only supported with chat models. Switch to a chat model and try again."
                )
            );
        }

        const assistantContent = isImageModel(selection.modelId)
            ? await generateImage(userInput, apiKey, selection.modelId, requestContext)
            : await generateAssistantReplyStreamed(
                sanitizeHistoryForTextModel(chatHistory),
                apiKey,
                selection.modelId,
                selection.thinkingLevel,
                selection.webSearchEnabled,
                (delta) => emitRuntimeMessage({ stream: { type: "delta", delta: delta } }),
                () => emitRuntimeMessage({ stream: { type: "start" } }),
                requestContext,
            );

        if (!assistantContent) {
            throw new Error(getI18nMessage("bgErrorNoContent", null, "No content was returned by the model."));
        }

        chatHistory.push({ role: "assistant", content: assistantContent });
        const nextChatState = updateSessionHistory(
            chatState.sessions,
            chatState.activeSession.id,
            chatHistory,
            userInput
        );
        await setStorageData({
            [STORAGE_KEYS.CHAT_SESSIONS]: nextChatState.sessions,
            [STORAGE_KEYS.ACTIVE_CHAT_ID]: nextChatState.activeChatId,
        });

        if (isImageModel(selection.modelId)) {
            emitRuntimeMessage({ imageUrl: assistantContent });
            return;
        }

        emitRuntimeMessage({ stream: { type: "done", text: assistantContent } });
    } catch (error) {
        if (isRequestCanceledError(error)) {
            emitRuntimeMessage({ stream: { type: "done", text: "" } });
            return;
        }

        emitRuntimeMessage({ error: getErrorMessage(error) });
        console.error(error);
    } finally {
        finishActiveRequest(requestContext);
    }
}

async function handleRegenerateMessage(rawChatId) {
    const requestContext = startActiveRequest();
    try {
        await i18nInitializationPromise;

        const storageKeys = STORAGE_FIELDS.concat([STORAGE_KEYS.MODEL, STORAGE_KEYS.THINKING, STORAGE_KEYS.WEB_SEARCH, STORAGE_KEYS.SYSTEM_MESSAGE]);
        const storedData = await getStorageData(storageKeys);
        const apiKey = sanitizeApiKey(storedData.apiKey);
        const selection = normalizeSelection(storedData);
        const systemMessage = getSystemMessageContent(storedData[STORAGE_KEYS.SYSTEM_MESSAGE]);
        const chatState = normalizeChatSessionsState(
            storedData[STORAGE_KEYS.CHAT_SESSIONS],
            storedData[STORAGE_KEYS.ACTIVE_CHAT_ID],
            normalizeChatId(rawChatId),
            storedData[LEGACY_CHAT_HISTORY_KEY],
            false
        );

        await persistNormalizedSelection(selection.updates);
        await persistNormalizedChatState(chatState);

        if (!apiKey) {
            throw new Error(getI18nMessage("bgErrorApiKeyMissing", null, "Please add a valid OpenAI API key in settings."));
        }

        const regenerateContext = getRegenerateContext(chatState.activeSession.history, systemMessage);

        let assistantContent;
        if (isImageModel(selection.modelId)) {
            assistantContent = await generateImage(regenerateContext.userPrompt, apiKey, selection.modelId, requestContext);
        } else {
            assistantContent = await generateAssistantReplyStreamed(
                sanitizeHistoryForTextModel(regenerateContext.requestHistory),
                apiKey,
                selection.modelId,
                selection.thinkingLevel,
                selection.webSearchEnabled,
                (delta) => emitRuntimeMessage({ stream: { type: "delta", delta: delta } }),
                () => emitRuntimeMessage({ stream: { type: "start" } }),
                requestContext,
            );
        }

        const nextChatHistory = regenerateContext.requestHistory.concat([{ role: "assistant", content: assistantContent }]);
        const nextChatState = updateSessionHistory(
            chatState.sessions,
            chatState.activeSession.id,
            nextChatHistory,
            ""
        );
        await setStorageData({
            [STORAGE_KEYS.CHAT_SESSIONS]: nextChatState.sessions,
            [STORAGE_KEYS.ACTIVE_CHAT_ID]: nextChatState.activeChatId,
        });

        if (isImageModel(selection.modelId)) {
            emitRuntimeMessage({ imageUrl: assistantContent });
            return;
        }

        emitRuntimeMessage({ stream: { type: "done", text: assistantContent } });
    } catch (error) {
        if (isRequestCanceledError(error)) {
            emitRuntimeMessage({ stream: { type: "done", text: "" } });
            return;
        }

        emitRuntimeMessage({ error: getErrorMessage(error) });
        console.error(error);
    } finally {
        finishActiveRequest(requestContext);
    }
}

function normalizeSelection(storedData) {
    const modelId = getValidModelId(storedData[STORAGE_KEYS.MODEL]);
    const thinkingLevel = getValidThinkingLevel(storedData[STORAGE_KEYS.THINKING], modelId);
    const webSearchEnabled = getValidWebSearchEnabled(storedData[STORAGE_KEYS.WEB_SEARCH]);
    const updates = {};

    if (modelId !== storedData[STORAGE_KEYS.MODEL]) {
        updates[STORAGE_KEYS.MODEL] = modelId;
    }

    if (thinkingLevel !== storedData[STORAGE_KEYS.THINKING]) {
        updates[STORAGE_KEYS.THINKING] = thinkingLevel;
    }

    if (webSearchEnabled !== storedData[STORAGE_KEYS.WEB_SEARCH]) {
        updates[STORAGE_KEYS.WEB_SEARCH] = webSearchEnabled;
    }

    return {
        modelId,
        thinkingLevel,
        webSearchEnabled,
        updates,
    };
}

async function persistNormalizedSelection(updates) {
    if (Object.keys(updates).length === 0) {
        return;
    }

    await setStorageData(updates);
}

function sanitizeApiKey(apiKey) {
    if (typeof apiKey !== "string") {
        return "";
    }

    return apiKey.trim();
}

function normalizeChatId(rawChatId) {
    if (typeof rawChatId !== "string") {
        return "";
    }

    return rawChatId.trim();
}

async function persistNormalizedChatState(chatState) {
    if (!chatState || chatState.changed !== true) {
        return;
    }

    await setStorageData({
        [STORAGE_KEYS.CHAT_SESSIONS]: chatState.sessions,
        [STORAGE_KEYS.ACTIVE_CHAT_ID]: chatState.activeChatId,
    });
}

function normalizeChatSessionsState(rawSessions, rawActiveChatId, preferredChatId, legacyChatHistory, allowCreateRequestedSession) {
    const sessions = [];
    const seenIds = new Set();
    const now = Date.now();

    if (Array.isArray(rawSessions)) {
        for (const session of rawSessions) {
            if (!session || typeof session !== "object") {
                continue;
            }

            const sessionId = normalizeChatId(session.id);
            if (!sessionId || seenIds.has(sessionId)) {
                continue;
            }

            seenIds.add(sessionId);
            const createdAt = Number.isFinite(session.createdAt) ? Number(session.createdAt) : now;
            const updatedAt = Number.isFinite(session.updatedAt) ? Number(session.updatedAt) : createdAt;
            sessions.push({
                id: sessionId,
                title: normalizeSessionTitle(session.title),
                history: normalizeStoredSessionHistory(session.history),
                pinned: Boolean(session.pinned),
                createdAt: createdAt,
                updatedAt: updatedAt,
            });
        }
    }

    if (sessions.length === 0) {
        const legacyHistory = normalizeStoredSessionHistory(legacyChatHistory);
        sessions.push({
            id: createChatSessionId(),
            title: generateChatTitleFromHistory(legacyHistory),
            history: legacyHistory,
            pinned: false,
            createdAt: now,
            updatedAt: now,
        });
    }

    const requestedChatId = normalizeChatId(preferredChatId);
    if (allowCreateRequestedSession === true && requestedChatId && !sessions.some((session) => session.id === requestedChatId)) {
        sessions.push({
            id: requestedChatId,
            title: "",
            history: [],
            pinned: false,
            createdAt: now,
            updatedAt: now,
        });
    }

    const normalizedSessions = normalizeChatSessionsForStorage(sessions);
    const storedActiveChatId = normalizeChatId(rawActiveChatId);
    const hasRequestedChat = normalizedSessions.some((session) => session.id === requestedChatId);
    const hasStoredActive = normalizedSessions.some((session) => session.id === storedActiveChatId);
    const activeChatId = hasRequestedChat
        ? requestedChatId
        : (hasStoredActive ? storedActiveChatId : normalizedSessions[0].id);
    const activeSession = normalizedSessions.find((session) => session.id === activeChatId) || normalizedSessions[0];
    const changed = JSON.stringify(Array.isArray(rawSessions) ? rawSessions : []) !== JSON.stringify(normalizedSessions)
        || storedActiveChatId !== activeChatId;

    return {
        sessions: normalizedSessions,
        activeChatId: activeChatId,
        activeSession: activeSession,
        changed: changed,
    };
}

function updateSessionHistory(sessions, activeChatId, requestHistory, userInputForTitle) {
    const normalizedSessions = normalizeChatSessionsForStorage(sessions);
    const sessionIndex = normalizedSessions.findIndex((session) => session.id === activeChatId);
    if (sessionIndex === -1) {
        throw new Error(getI18nMessage("bgErrorGeneric", null, "Something went wrong. Please try again."));
    }

    const nextSessions = normalizedSessions.slice();
    const currentSession = nextSessions[sessionIndex];
    const nextHistory = normalizeChatHistoryForStorage(requestHistory);
    const generatedTitle = generateChatTitleFromUserInput(userInputForTitle)
        || generateChatTitleFromHistory(nextHistory);
    nextSessions[sessionIndex] = {
        ...currentSession,
        title: normalizeSessionTitle(currentSession.title) || generatedTitle,
        history: nextHistory,
        updatedAt: Date.now(),
    };

    const finalSessions = normalizeChatSessionsForStorage(nextSessions);
    const hasActiveChat = finalSessions.some((session) => session.id === activeChatId);

    return {
        sessions: finalSessions,
        activeChatId: hasActiveChat ? activeChatId : finalSessions[0].id,
    };
}

function normalizeChatSessionsForStorage(sessions) {
    const normalizedSessions = (Array.isArray(sessions) ? sessions.slice() : [])
        .sort((leftSession, rightSession) => {
            const leftPinnedScore = leftSession && leftSession.pinned ? 1 : 0;
            const rightPinnedScore = rightSession && rightSession.pinned ? 1 : 0;
            if (leftPinnedScore !== rightPinnedScore) {
                return rightPinnedScore - leftPinnedScore;
            }

            return Number(rightSession.updatedAt || 0) - Number(leftSession.updatedAt || 0);
        })
        .slice(0, MAX_CHAT_SESSIONS);

    return normalizedSessions.map((session) => ({
        id: session.id,
        title: normalizeSessionTitle(session.title),
        history: normalizeStoredSessionHistory(session.history),
        pinned: Boolean(session.pinned),
        createdAt: Number.isFinite(session.createdAt) ? Number(session.createdAt) : Date.now(),
        updatedAt: Number.isFinite(session.updatedAt) ? Number(session.updatedAt) : Date.now(),
    }));
}

function normalizeStoredSessionHistory(rawHistory) {
    return normalizeChatHistoryForStorage(rawHistory);
}

function normalizeSessionTitle(rawTitle) {
    if (typeof rawTitle !== "string") {
        return "";
    }

    return rawTitle.trim().slice(0, 80);
}

function generateChatTitleFromUserInput(userInput) {
    if (typeof userInput !== "string") {
        return "";
    }

    const firstLine = userInput.trim().split("\n")[0] || "";
    return firstLine.slice(0, 52);
}

function generateChatTitleFromHistory(history) {
    if (!Array.isArray(history)) {
        return "";
    }

    for (const entry of history) {
        if (!entry || entry.role !== "user" || typeof entry.content !== "string") {
            continue;
        }

        const generatedTitle = generateChatTitleFromUserInput(entry.content);
        if (generatedTitle) {
            return generatedTitle;
        }
    }

    return "";
}

function createChatSessionId() {
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildChatHistory(storedHistory, systemMessage, userInput, attachments) {
    const validHistory = Array.isArray(storedHistory)
        ? storedHistory.filter(isValidChatMessage)
        : [];

    const historyWithoutSystemMessages = validHistory.filter((entry) => entry.role !== "system");
    const history = [{
        role: "system",
        content: systemMessage,
    }, ...historyWithoutSystemMessages];

    history.push({ role: "user", content: createUserMessageContent(userInput, attachments) });
    return history;
}

function getRegenerateContext(storedHistory, systemMessage) {
    const validHistory = Array.isArray(storedHistory)
        ? storedHistory.filter(isValidChatMessage)
        : [];
    const historyWithoutSystem = validHistory.filter((entry) => entry.role !== "system");
    const lastUserIndex = getLastRoleIndex(historyWithoutSystem, "user");

    if (lastUserIndex === -1) {
        throw new Error(getI18nMessage("bgErrorNoUserMessage", null, "No previous user message found to regenerate."));
    }

    const conversationUntilLastUser = historyWithoutSystem.slice(0, lastUserIndex + 1);
    const requestHistory = [{ role: "system", content: systemMessage }].concat(conversationUntilLastUser);
    const lastUserMessage = conversationUntilLastUser[lastUserIndex];

    return {
        requestHistory: requestHistory,
        userPrompt: lastUserMessage.content,
    };
}

function isValidChatMessage(entry) {
    if (!entry || typeof entry !== "object") {
        return false;
    }

    const validRole = entry.role === "system" || entry.role === "user" || entry.role === "assistant";
    return validRole && typeof entry.content === "string";
}

function normalizeAttachments(rawAttachments) {
    if (!Array.isArray(rawAttachments)) {
        return [];
    }

    const normalizedAttachments = [];

    for (const attachment of rawAttachments) {
        if (normalizedAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
            break;
        }

        if (!attachment || typeof attachment !== "object") {
            continue;
        }

        const dataUrl = typeof attachment.dataUrl === "string" ? attachment.dataUrl.trim() : "";
        if (!dataUrl.startsWith("data:") || dataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) {
            continue;
        }

        const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType.trim().toLowerCase() : "";
        const fileName = sanitizeAttachmentFileName(attachment.fileName);
        const isImage = Boolean(attachment.isImage) || mimeType.startsWith("image/");

        normalizedAttachments.push({
            fileName,
            mimeType,
            dataUrl,
            isImage,
        });
    }

    return normalizedAttachments;
}

function sanitizeAttachmentFileName(fileName) {
    if (typeof fileName !== "string") {
        return getI18nMessage("bgAttachmentFallbackName", null, "attachment");
    }

    const normalizedName = fileName.trim().slice(0, 120);
    return normalizedName || getI18nMessage("bgAttachmentFallbackName", null, "attachment");
}

function createUserMessageContent(userInput, attachments) {
    const trimmedUserInput = typeof userInput === "string" ? userInput.trim() : "";
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return trimmedUserInput;
    }

    const inputItems = [];

    if (trimmedUserInput.length > 0) {
        inputItems.push({
            type: "input_text",
            text: trimmedUserInput,
        });
    }

    for (const attachment of attachments) {
        if (attachment.isImage) {
            inputItems.push({
                type: "input_image",
                image_url: attachment.dataUrl,
            });
            continue;
        }

        inputItems.push({
            type: "input_file",
            filename: attachment.fileName,
            file_data: attachment.dataUrl,
        });
    }

    return inputItems;
}

function normalizeChatHistoryForStorage(chatHistory) {
    if (!Array.isArray(chatHistory)) {
        return [];
    }

    const nextHistory = [];
    for (const entry of chatHistory) {
        if (!entry || typeof entry !== "object") {
            continue;
        }

        if (entry.role === "assistant" && typeof entry.content === "string") {
            nextHistory.push({ role: "assistant", content: entry.content });
            continue;
        }

        if (entry.role !== "user") {
            continue;
        }

        const serializedUserContent = serializeUserContentForStorage(entry.content);
        if (serializedUserContent.length === 0) {
            continue;
        }

        nextHistory.push({
            role: "user",
            content: serializedUserContent,
        });
    }

    return nextHistory;
}

function serializeUserContentForStorage(content) {
    if (typeof content === "string") {
        return content;
    }

    if (!Array.isArray(content)) {
        return "";
    }

    let textContent = "";
    const attachmentLabels = [];

    for (const item of content) {
        if (!item || typeof item !== "object") {
            continue;
        }

        if (item.type === "input_text" && typeof item.text === "string" && textContent.length === 0) {
            textContent = item.text.trim();
            continue;
        }

        if (item.type === "input_file") {
            attachmentLabels.push(sanitizeAttachmentFileName(item.filename));
            continue;
        }

        if (item.type === "input_image") {
            attachmentLabels.push(getI18nMessage("bgAttachmentImageToken", null, "image"));
        }
    }

    if (attachmentLabels.length === 0) {
        return textContent;
    }

    const attachmentPrefix = getI18nMessage("bgAttachmentsPrefix", null, "Attachments");
    const attachmentSummary = `${attachmentPrefix}: ${attachmentLabels.join(", ")}`;
    return textContent.length > 0 ? `${textContent}\n\n${attachmentSummary}` : attachmentSummary;
}

function sanitizeHistoryForTextModel(chatHistory) {
    if (!Array.isArray(chatHistory)) {
        return [];
    }

    return chatHistory.map(function (entry) {
        if (!entry || typeof entry !== "object") {
            return entry;
        }

        if (entry.role !== "assistant" || typeof entry.content !== "string") {
            return entry;
        }

        if (!isAssistantImageContent(entry.content)) {
            return entry;
        }

        return {
            role: "assistant",
            content: getImageContextPlaceholder(),
        };
    });
}

function isAssistantImageContent(content) {
    if (typeof content !== "string") {
        return false;
    }

    const normalizedContent = content.trim();
    return normalizedContent.startsWith("data:image/")
        || normalizedContent.startsWith("https://oaidalleapiprodscus.blob.core.windows.net/")
        || normalizedContent.startsWith("https://oaidalleapiprodscuswestus.blob.core.windows.net/");
}

function getLastRoleIndex(entries, role) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].role === role) {
            return index;
        }
    }

    return -1;
}

async function generateAssistantReplyStreamed(messages, apiKey, modelId, thinkingLevel, webSearchEnabled, onDelta, onStart, requestContext) {
    const payload = {
        input: messages,
        model: modelId,
        stream: true,
    };

    const reasoningEffort = getThinkingEffort(thinkingLevel, modelId);
    if (supportsThinking(modelId) && reasoningEffort) {
        payload.reasoning = { effort: reasoningEffort };
    }

    if (webSearchEnabled === true && supportsWebSearch(modelId)) {
        payload.tools = [{ type: "web_search" }];
    }

    let assistantText = "";
    let completedResponse = null;

    await streamOpenAIResponse("/responses", payload, apiKey, function (eventName, eventData) {
        if (eventName === "response.output_text.delta" && typeof eventData.delta === "string") {
            assistantText += eventData.delta;
            if (typeof onDelta === "function") {
                onDelta(eventData.delta);
            }
            return;
        }

        if (eventName === "response.output_text.done" && typeof eventData.text === "string" && assistantText.length === 0) {
            assistantText = eventData.text;
            if (typeof onDelta === "function" && eventData.text.length > 0) {
                onDelta(eventData.text);
            }
            return;
        }

        if (eventName === "response.completed" && eventData && eventData.response) {
            completedResponse = eventData.response;
            return;
        }

        if (eventName === "response.failed") {
            throw buildStreamError(eventData);
        }

        if (eventName === "error") {
            throw buildStreamError(eventData);
        }
    }, onStart, requestContext);

    if (assistantText.length === 0 && completedResponse) {
        assistantText = extractAssistantText(completedResponse) || "";
    }

    if (!assistantText) {
        throw new Error(getI18nMessage("bgErrorNoTextResponse", null, "No text response was returned by the model."));
    }

    return assistantText;
}

async function generateImage(prompt, apiKey, modelId, requestContext) {
    const payload = {
        prompt: prompt,
        model: modelId,
        n: 1,
        size: "1024x1024",
    };

    const responseBody = await requestOpenAIJson("/images/generations", payload, apiKey, requestContext);
    const imageUrl = extractImageUrl(responseBody);

    if (!imageUrl) {
        throw new Error(getI18nMessage("bgErrorNoImageResponse", null, "No image was returned by the model."));
    }

    return imageUrl;
}

async function streamOpenAIResponse(path, payload, apiKey, onEvent, onOpen, requestContext) {
    const controller = requestContext ? requestContext.controller : new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(function () {
        didTimeout = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${OPENAI_API_BASE_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        if (!response.ok) {
            const responseBody = await parseJsonResponse(response);
            throw buildApiError(response.status, responseBody);
        }

        if (!response.body) {
            throw new Error(getI18nMessage("bgErrorStreamingUnsupported", null, "Streaming is not supported in this environment."));
        }

        if (typeof onOpen === "function") {
            onOpen();
        }

        await consumeSseStream(response.body, onEvent);
    } catch (error) {
        if (error && error.name === "AbortError") {
            if (didTimeout) {
                throw new Error(getI18nMessage("bgErrorTimeout", null, "The request timed out. Please try again."));
            }

            throw new Error(REQUEST_CANCELED_ERROR_MESSAGE);
        }

        if (requestContext && requestContext.canceled) {
            throw new Error(REQUEST_CANCELED_ERROR_MESSAGE);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function requestOpenAIJson(path, payload, apiKey, requestContext) {
    const controller = requestContext ? requestContext.controller : new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(function () {
        didTimeout = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${OPENAI_API_BASE_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        const responseBody = await parseJsonResponse(response);

        if (!response.ok) {
            throw buildApiError(response.status, responseBody);
        }

        return responseBody;
    } catch (error) {
        if (error && error.name === "AbortError") {
            if (didTimeout) {
                throw new Error(getI18nMessage("bgErrorTimeout", null, "The request timed out. Please try again."));
            }

            throw new Error(REQUEST_CANCELED_ERROR_MESSAGE);
        }

        if (requestContext && requestContext.canceled) {
            throw new Error(REQUEST_CANCELED_ERROR_MESSAGE);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function startActiveRequest() {
    cancelActiveRequest();
    const requestContext = {
        controller: new AbortController(),
        canceled: false,
    };

    activeRequestContext = requestContext;
    return requestContext;
}

function finishActiveRequest(requestContext) {
    if (activeRequestContext === requestContext) {
        activeRequestContext = null;
    }
}

function cancelActiveRequest() {
    if (!activeRequestContext) {
        return false;
    }

    activeRequestContext.canceled = true;
    activeRequestContext.controller.abort();
    return true;
}

function isRequestCanceledError(error) {
    return Boolean(error && typeof error.message === "string" && error.message === REQUEST_CANCELED_ERROR_MESSAGE);
}

async function consumeSseStream(stream, onEvent) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const readResult = await reader.read();
        const chunk = readResult.value || new Uint8Array();

        buffer += decoder.decode(chunk, { stream: !readResult.done }).replace(/\r/g, "");

        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
            const rawEvent = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);

            const parsedEvent = parseSseEvent(rawEvent);
            if (parsedEvent && !parsedEvent.done && typeof onEvent === "function") {
                onEvent(parsedEvent.event, parsedEvent.data);
            }

            separatorIndex = buffer.indexOf("\n\n");
        }

        if (readResult.done) {
            break;
        }
    }

    const trailingEvent = parseSseEvent(buffer.trim());
    if (trailingEvent && !trailingEvent.done && typeof onEvent === "function") {
        onEvent(trailingEvent.event, trailingEvent.data);
    }
}

function parseSseEvent(rawEvent) {
    if (!rawEvent) {
        return null;
    }

    const lines = rawEvent.split("\n");
    let eventName = "";
    const dataLines = [];

    for (const line of lines) {
        if (!line || line.startsWith(":")) {
            continue;
        }

        if (line.startsWith("event:")) {
            eventName = line.slice("event:".length).trim();
            continue;
        }

        if (line.startsWith("data:")) {
            dataLines.push(line.slice("data:".length).trimStart());
        }
    }

    if (dataLines.length === 0) {
        return null;
    }

    const dataText = dataLines.join("\n");
    if (dataText === "[DONE]") {
        return { done: true, event: eventName, data: null };
    }

    try {
        const parsedData = JSON.parse(dataText);
        const resolvedEventName = eventName || (
            parsedData && typeof parsedData.type === "string"
                ? parsedData.type
                : ""
        );

        return { done: false, event: resolvedEventName, data: parsedData };
    } catch {
        return null;
    }
}

function buildStreamError(eventData) {
    const message = eventData
        && (
            (eventData.response
                && eventData.response.error
                && typeof eventData.response.error.message === "string"
                && eventData.response.error.message)
            || (eventData.error
                && typeof eventData.error.message === "string"
                && eventData.error.message)
            || (typeof eventData.message === "string" && eventData.message)
        );

    return new Error(message || getI18nMessage("bgErrorStreamingFailed", null, "The streaming request failed."));
}

async function parseJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function buildApiError(statusCode, responseBody) {
    if (statusCode === 401) {
        return new Error(
            getI18nMessage(
                "bgErrorApiKeyInvalid",
                null,
                "Looks like your API key is incorrect. Please check your API key and try again."
            )
        );
    }

    const apiMessage = responseBody
        && responseBody.error
        && typeof responseBody.error.message === "string"
        ? responseBody.error.message
        : null;

    return new Error(
        apiMessage
        || getI18nMessage("bgErrorFetchStatus", String(statusCode), `Failed to fetch. Status code: ${statusCode}`)
    );
}

function extractAssistantText(responseBody) {
    if (!responseBody) {
        return null;
    }

    if (typeof responseBody.output_text === "string" && responseBody.output_text.trim()) {
        return responseBody.output_text;
    }

    if (!Array.isArray(responseBody.output)) {
        return null;
    }

    for (const outputItem of responseBody.output) {
        if (outputItem.type !== "message" || outputItem.role !== "assistant" || !Array.isArray(outputItem.content)) {
            continue;
        }

        const messageTextParts = outputItem.content
            .filter((contentItem) => contentItem.type === "output_text" && typeof contentItem.text === "string")
            .map((contentItem) => contentItem.text);

        if (messageTextParts.length > 0) {
            return messageTextParts.join("\n");
        }
    }

    return null;
}

function extractImageUrl(responseBody) {
    if (!responseBody || !Array.isArray(responseBody.data) || responseBody.data.length === 0) {
        return null;
    }

    const imageItem = responseBody.data[0];

    if (typeof imageItem.url === "string" && imageItem.url.length > 0) {
        return imageItem.url;
    }

    if (typeof imageItem.b64_json === "string" && imageItem.b64_json.length > 0) {
        return `data:image/png;base64,${imageItem.b64_json}`;
    }

    return null;
}

function emitRuntimeMessage(payload) {
    chrome.runtime.sendMessage(payload, function () {
        void chrome.runtime.lastError;
    });
}

function getErrorMessage(error) {
    if (error && typeof error.message === "string") {
        return error.message;
    }

    return getI18nMessage("bgErrorGeneric", null, "Something went wrong. Please try again.");
}

async function initializeLanguagePreference() {
    try {
        const storedValues = await getStorageData([STORAGE_KEYS.LANGUAGE]);
        const normalizedLanguagePreference = getValidLanguagePreference(storedValues[STORAGE_KEYS.LANGUAGE]);

        if (normalizedLanguagePreference !== storedValues[STORAGE_KEYS.LANGUAGE]) {
            await setStorageData({ [STORAGE_KEYS.LANGUAGE]: normalizedLanguagePreference });
        }

        await setLanguagePreference(normalizedLanguagePreference);
    } catch (error) {
        console.error(error);
    }
}

function getDefaultSystemMessage() {
    return getI18nMessage(
        "bgDefaultSystemMessage",
        null,
        "You are an AI assistant. Always provide clear, accurate, and concise answers to user queries. If unsure, say so honestly. Be helpful and polite."
    );
}

function getImageContextPlaceholder() {
    return getI18nMessage(
        "bgImageContextPlaceholder",
        null,
        "[Assistant generated an image in a previous turn. The raw image payload is omitted from context.]"
    );
}

function getSystemMessageContent(customSystemMessage) {
    const defaultSystemMessage = getDefaultSystemMessage();
    if (typeof customSystemMessage !== "string") {
        return defaultSystemMessage;
    }

    const sanitizedMessage = customSystemMessage.trim().slice(0, MAX_SYSTEM_MESSAGE_LENGTH);
    return sanitizedMessage || defaultSystemMessage;
}

function getStorageData(keys) {
    return new Promise(function (resolve, reject) {
        chrome.storage.local.get(keys, function (result) {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            resolve(result || {});
        });
    });
}

function setStorageData(data) {
    return new Promise(function (resolve, reject) {
        chrome.storage.local.set(data, function () {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            resolve();
        });
    });
}

function getI18nMessage(key, substitutions, fallback) {
    if (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && typeof OPENAI_MODELS.getI18nMessage === "function") {
        return OPENAI_MODELS.getI18nMessage(key, substitutions, fallback);
    }

    if (typeof chrome === "object" && chrome && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        const message = chrome.i18n.getMessage(key, substitutions);
        if (typeof message === "string" && message.length > 0) {
            return message;
        }
    }

    if (typeof fallback === "string") {
        return fallback;
    }

    return key;
}
