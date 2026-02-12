const SEND_ICON_HTML = '<i class="fa fa-arrow-up"></i>';
const STOP_ICON_HTML = '<i class="fa fa-stop"></i>';
const EMPTY_STATE_ID = "assistant-info-wrapper";
const EMPTY_STATE_VISIBLE_EXAMPLES = 3;
const EMPTY_STATE_EXAMPLES = [
    {
        key: "popupEmptyStateExampleSummarize",
        fallback: "Summarize this page in 5 bullet points.",
    },
    {
        key: "popupEmptyStateExampleDraftEmail",
        fallback: "Write a concise follow-up email for a client.",
    },
    {
        key: "popupEmptyStateExampleTranslate",
        fallback: "Translate this text to German and keep the tone.",
    },
    {
        key: "popupEmptyStateExampleCodeReview",
        fallback: "Review this code and point out bugs and risks.",
    },
    {
        key: "popupEmptyStateExampleImagePrompt",
        fallback: "Create an image prompt for a modern app landing page.",
    },
    {
        key: "popupEmptyStateExampleMeetingNotes",
        fallback: "Turn these rough notes into clear meeting minutes.",
    },
    {
        key: "popupEmptyStateExampleWeeklyPlan",
        fallback: "Plan my week with priorities and time blocks.",
    },
    {
        key: "popupEmptyStateExampleExplainConcept",
        fallback: "Explain this concept like I am new to it.",
    },
    {
        key: "popupEmptyStateExampleRewriteTone",
        fallback: "Rewrite this message to sound professional but friendly.",
    },
];
const CODE_BLOCK_REGEX = /```([\w+-]*)\n?([\s\S]*?)```/g;
const MAX_ATTACHMENTS_PER_MESSAGE = 6;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_CHAT_SESSIONS = 12;
const DEFAULT_CHAT_LABEL_FALLBACK = "New chat";

const {
    MODELS,
    STORAGE_KEYS,
    DEFAULT_MODEL_ID,
    DEFAULT_THINKING_LEVEL,
    DEFAULT_WEB_SEARCH_ENABLED,
    DEFAULT_ACCENT_COLOR,
    getModelById,
    getValidModelId,
    getValidThinkingLevel,
    getThinkingLevelOptions,
    getValidWebSearchEnabled,
    getValidAccentColor,
    getValidLanguagePreference,
    setLanguagePreference,
    getThinkingLabel,
    supportsThinking,
    supportsWebSearch,
} = OPENAI_MODELS;

document.addEventListener("DOMContentLoaded", function () {
    const app = new PopupApp();
    void app.init().catch((error) => {
        console.error(error);
    });
});

class PopupApp {
    constructor() {
        this.state = {
            selectedModelId: DEFAULT_MODEL_ID,
            selectedThinkingLevel: DEFAULT_THINKING_LEVEL,
            webSearchEnabled: DEFAULT_WEB_SEARCH_ENABLED,
            accentColor: DEFAULT_ACCENT_COLOR,
            chatSessions: [],
            activeChatId: "",
            editingChatId: "",
            pendingAttachments: [],
            isAwaitingResponse: false,
            pendingAssistantMessage: null,
            streamingAssistantMessage: null,
        };

        this.dom = {
            chatMessages: document.getElementById("chat-messages"),
            userInput: document.getElementById("user-input"),
            attachBtn: document.getElementById("attach-btn"),
            attachmentCount: document.getElementById("attachment-count"),
            attachmentInput: document.getElementById("attachment-input"),
            fileDropOverlay: document.getElementById("file-drop-overlay"),
            fileDropOverlayText: document.getElementById("file-drop-overlay-text"),
            sendBtn: document.getElementById("send-btn"),
            clearChatBtn: document.getElementById("clear-chat-btn"),
            settingsBtn: document.getElementById("settings-btn"),
            chatDropdownBtn: document.getElementById("chat-dropdown-btn"),
            chatDropdownBtnText: document.getElementById("chat-dropdown-btn-text"),
            chatDropdownContent: document.getElementById("chat-dropdown-content"),
            newChatBtn: document.getElementById("new-chat-btn"),
            modelDropdownBtn: document.getElementById("model-dropdown-btn"),
            modelDropdownBtnText: document.getElementById("model-dropdown-btn-text"),
            modelDropdownContent: document.getElementById("model-dropdown-content"),
            thinkingDropdown: document.getElementById("thinking-dropdown"),
            thinkingDropdownBtn: document.getElementById("thinking-dropdown-btn"),
            thinkingDropdownBtnText: document.getElementById("thinking-dropdown-btn-text"),
            thinkingDropdownContent: document.getElementById("thinking-dropdown-content"),
            webSearchToggleBtn: document.getElementById("web-search-toggle-btn"),
        };

        this.boundRuntimeMessageHandler = this.handleRuntimeMessage.bind(this);
        this.boundStorageChangeHandler = this.handleStorageChange.bind(this);
        this.boundFileDragEnterHandler = this.handleFileDragEnter.bind(this);
        this.boundFileDragOverHandler = this.handleFileDragOver.bind(this);
        this.boundFileDragLeaveHandler = this.handleFileDragLeave.bind(this);
        this.boundFileDropHandler = this.handleFileDrop.bind(this);
        this.fileDragDepth = 0;
    }

    async init() {
        try {
            await this.loadLanguageSetting();
            this.applyLocalization();
            this.renderModelOptions();
            this.renderThinkingOptions();
            this.bindEvents();

            await Promise.all([
                this.ensureApiKeyExists(),
                this.loadChatSessions(),
                this.loadModelSettings(),
                this.loadAppearanceSettings(),
            ]);

            this.dom.userInput.focus();
            this.renderAttachmentState();
            this.updateComposerState();
        } catch (error) {
            this.reportSystemError(getSafeErrorMessage(error));
        }
    }

    applyLocalization() {
        if (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && typeof OPENAI_MODELS.getResolvedLanguage === "function") {
            document.documentElement.lang = OPENAI_MODELS.getResolvedLanguage();
        }

        this.dom.chatDropdownBtn.title = getI18nMessage("popupChatChangeTitle", null, "Change chat");
        this.dom.newChatBtn.title = getI18nMessage("popupNewChatTitle", null, "New chat");
        this.dom.modelDropdownBtn.title = getI18nMessage("popupModelChangeTitle", null, "Change model");
        this.dom.thinkingDropdownBtn.title = getI18nMessage("popupThinkingChangeTitle", null, "Change thinking level");
        this.dom.webSearchToggleBtn.title = getI18nMessage("popupWebToggleTitle", null, "Toggle web search");
        if (this.dom.clearChatBtn) {
            this.dom.clearChatBtn.title = getI18nMessage("popupClearChatTitle", null, "Clear chat");
        }
        this.dom.settingsBtn.title = getI18nMessage("popupSettingsTitle", null, "Settings");
        this.dom.attachBtn.title = getI18nMessage("popupAttachTitle", null, "Add files or images");
        this.dom.userInput.placeholder = getI18nMessage("popupInputPlaceholder", null, "Ask me anything...");
        this.dom.sendBtn.title = getI18nMessage("popupSendTitle", null, "Send message");
        if (this.dom.fileDropOverlayText) {
            this.dom.fileDropOverlayText.innerText = getI18nMessage(
                "popupDropFilesLabel",
                null,
                "Drop files or images to attach"
            );
        }

        const webLabel = this.dom.webSearchToggleBtn.querySelector(".dropdown-label");
        if (webLabel) {
            webLabel.innerText = getI18nMessage("popupWebToggleLabel", null, "Web");
        }

        this.renderChatOptions();
    }

    bindEvents() {
        this.dom.userInput.addEventListener("input", () => {
            this.autoResizeInput();
            this.updateComposerState();
        });

        this.dom.userInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void this.sendCurrentMessage();
            }
        });

        this.dom.sendBtn.addEventListener("click", () => {
            if (this.state.isAwaitingResponse) {
                this.stopCurrentResponse();
                return;
            }

            void this.sendCurrentMessage();
        });

        this.dom.attachBtn.addEventListener("click", () => {
            if (this.state.isAwaitingResponse) {
                return;
            }

            this.dom.attachmentInput.click();
        });

        this.dom.attachmentInput.addEventListener("change", () => {
            void this.handleAttachmentSelection();
        });

        if (this.dom.clearChatBtn) {
            this.dom.clearChatBtn.addEventListener("click", () => {
                void this.clearChatHistory();
            });
        }

        this.dom.settingsBtn.addEventListener("click", () => {
            chrome.runtime.openOptionsPage();
        });

        this.dom.chatDropdownBtn.addEventListener("click", () => {
            this.toggleDropdown(this.dom.chatDropdownBtn, this.dom.chatDropdownContent);
        });

        this.dom.newChatBtn.addEventListener("click", () => {
            void this.createNewChat(true);
        });

        this.dom.modelDropdownBtn.addEventListener("click", () => {
            this.toggleDropdown(this.dom.modelDropdownBtn, this.dom.modelDropdownContent);
        });

        this.dom.thinkingDropdownBtn.addEventListener("click", () => {
            this.toggleDropdown(this.dom.thinkingDropdownBtn, this.dom.thinkingDropdownContent);
        });

        this.dom.webSearchToggleBtn.addEventListener("click", () => {
            this.setWebSearchEnabled(!this.state.webSearchEnabled, true);
        });

        window.addEventListener("click", (event) => {
            const target = event.target;
            const clickedInsideDropdown = target instanceof Element && Boolean(target.closest(".dropdown"));
            if (!clickedInsideDropdown) {
                this.closeAllDropdowns();
            }
        });

        window.addEventListener("unload", () => {
            chrome.runtime.onMessage.removeListener(this.boundRuntimeMessageHandler);
            chrome.storage.onChanged.removeListener(this.boundStorageChangeHandler);
            window.removeEventListener("dragenter", this.boundFileDragEnterHandler, true);
            window.removeEventListener("dragover", this.boundFileDragOverHandler, true);
            window.removeEventListener("dragleave", this.boundFileDragLeaveHandler, true);
            window.removeEventListener("drop", this.boundFileDropHandler, true);
        });

        window.addEventListener("dragenter", this.boundFileDragEnterHandler, true);
        window.addEventListener("dragover", this.boundFileDragOverHandler, true);
        window.addEventListener("dragleave", this.boundFileDragLeaveHandler, true);
        window.addEventListener("drop", this.boundFileDropHandler, true);

        chrome.runtime.onMessage.addListener(this.boundRuntimeMessageHandler);
        chrome.storage.onChanged.addListener(this.boundStorageChangeHandler);
    }

    handleStorageChange(changes, areaName) {
        if (areaName !== "local" || !changes) {
            return;
        }

        if (changes[STORAGE_KEYS.LANGUAGE]) {
            const languageChange = changes[STORAGE_KEYS.LANGUAGE];
            void this.applyLanguageSetting(languageChange.newValue);
        }

        if (changes[STORAGE_KEYS.ACCENT_COLOR]) {
            const accentColorChange = changes[STORAGE_KEYS.ACCENT_COLOR];
            this.applyAccentColor(getValidAccentColor(accentColorChange.newValue));
        }

        if (changes[STORAGE_KEYS.WEB_SEARCH]) {
            const webSearchChange = changes[STORAGE_KEYS.WEB_SEARCH];
            this.setWebSearchEnabled(getValidWebSearchEnabled(webSearchChange.newValue), false);
        }

        if (
            !this.state.isAwaitingResponse
            && (changes[STORAGE_KEYS.CHAT_SESSIONS] || changes[STORAGE_KEYS.ACTIVE_CHAT_ID])
        ) {
            void this.loadChatSessions();
        }
    }

    async ensureApiKeyExists() {
        const result = await getStorageData(["apiKey"]);
        const apiKey = typeof result.apiKey === "string" ? result.apiKey.trim() : "";
        if (apiKey.length < 10) {
            chrome.runtime.openOptionsPage();
        }
    }

    async loadChatSessions() {
        const result = await getStorageData([STORAGE_KEYS.CHAT_SESSIONS, STORAGE_KEYS.ACTIVE_CHAT_ID, "chatHistory"]);
        const normalizedState = normalizeChatSessionsState(
            result[STORAGE_KEYS.CHAT_SESSIONS],
            result[STORAGE_KEYS.ACTIVE_CHAT_ID],
            result.chatHistory
        );
        const prunedState = pruneEmptyChatSessions(normalizedState.sessions, normalizedState.activeChatId, false);
        const nextSessions = prunedState.sessions;
        const nextActiveChatId = prunedState.activeChatId;
        const shouldPersistPrunedState = prunedState.changed;

        if (normalizedState.changed || shouldPersistPrunedState) {
            await setStorageData({
                [STORAGE_KEYS.CHAT_SESSIONS]: nextSessions,
                [STORAGE_KEYS.ACTIVE_CHAT_ID]: nextActiveChatId,
            });
        }

        this.state.chatSessions = nextSessions;
        this.state.activeChatId = nextActiveChatId;
        this.renderChatOptions();
        this.renderActiveChatHistory();
    }

    async loadModelSettings() {
        const result = await getStorageData([STORAGE_KEYS.MODEL, STORAGE_KEYS.THINKING, STORAGE_KEYS.WEB_SEARCH]);
        const normalizedModelId = getValidModelId(result[STORAGE_KEYS.MODEL]);
        const normalizedThinkingLevel = getValidThinkingLevel(result[STORAGE_KEYS.THINKING], normalizedModelId);
        const normalizedWebSearchEnabled = getValidWebSearchEnabled(result[STORAGE_KEYS.WEB_SEARCH]);
        const updates = {};

        if (normalizedModelId !== result[STORAGE_KEYS.MODEL]) {
            updates[STORAGE_KEYS.MODEL] = normalizedModelId;
        }

        if (normalizedThinkingLevel !== result[STORAGE_KEYS.THINKING]) {
            updates[STORAGE_KEYS.THINKING] = normalizedThinkingLevel;
        }

        if (normalizedWebSearchEnabled !== result[STORAGE_KEYS.WEB_SEARCH]) {
            updates[STORAGE_KEYS.WEB_SEARCH] = normalizedWebSearchEnabled;
        }

        if (Object.keys(updates).length > 0) {
            await setStorageData(updates);
        }

        this.setSelectedModel(normalizedModelId, false);
        this.setSelectedThinkingLevel(normalizedThinkingLevel, false);
        this.syncThinkingDropdownVisibility();
        this.setWebSearchEnabled(normalizedWebSearchEnabled, false);
    }

    async loadLanguageSetting() {
        const result = await getStorageData([STORAGE_KEYS.LANGUAGE]);
        const normalizedLanguagePreference = getValidLanguagePreference(result[STORAGE_KEYS.LANGUAGE]);

        if (normalizedLanguagePreference !== result[STORAGE_KEYS.LANGUAGE]) {
            await setStorageData({ [STORAGE_KEYS.LANGUAGE]: normalizedLanguagePreference });
        }

        await setLanguagePreference(normalizedLanguagePreference);
    }

    async loadAppearanceSettings() {
        const result = await getStorageData([STORAGE_KEYS.ACCENT_COLOR]);
        const normalizedAccentColor = getValidAccentColor(result[STORAGE_KEYS.ACCENT_COLOR]);

        if (normalizedAccentColor !== result[STORAGE_KEYS.ACCENT_COLOR]) {
            await setStorageData({ [STORAGE_KEYS.ACCENT_COLOR]: normalizedAccentColor });
        }

        this.applyAccentColor(normalizedAccentColor);
    }

    async sendCurrentMessage() {
        const userMessage = this.dom.userInput.value.trim();
        const attachments = this.state.pendingAttachments.slice();
        if ((!userMessage && attachments.length === 0) || this.state.isAwaitingResponse) {
            return;
        }

        if (!this.state.activeChatId) {
            await this.createNewChat(false);
        }

        const visibleUserMessage = buildUserMessagePreview(userMessage, attachments);
        const attachmentsPayload = attachments.map(cloneAttachmentForRuntime);

        this.hideAssistantInfo();
        this.appendMessage("user", visibleUserMessage);
        this.dom.userInput.value = "";
        this.clearPendingAttachments();
        this.autoResizeInput();
        this.setAwaitingResponse(true);
        this.showPendingAssistantMessage();

        this.touchActiveChatSession(userMessage);

        chrome.runtime.sendMessage({ userInput: userMessage, attachments: attachmentsPayload, chatId: this.state.activeChatId }, () => {
            if (chrome.runtime.lastError) {
                this.removePendingAssistantMessage();
                this.state.pendingAttachments = attachments;
                this.renderAttachmentState();
                this.reportSystemError(getI18nMessage("popupErrorSendFailed", null, "Failed to send message. Please try again."));
            }
        });
    }

    async handleAttachmentSelection() {
        const files = Array.from(this.dom.attachmentInput.files || []);
        this.dom.attachmentInput.value = "";
        await this.addPendingAttachmentsFromFiles(files);
    }

    async addPendingAttachmentsFromFiles(files) {
        if (files.length === 0) {
            return;
        }

        const availableSlots = MAX_ATTACHMENTS_PER_MESSAGE - this.state.pendingAttachments.length;
        if (availableSlots <= 0) {
            this.appendMessage(
                "system",
                getI18nMessage(
                    "popupAttachmentLimitMessage",
                    String(MAX_ATTACHMENTS_PER_MESSAGE),
                    `You can only attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`
                )
            );
            return;
        }

        if (files.length > availableSlots) {
            this.appendMessage(
                "system",
                getI18nMessage(
                    "popupAttachmentLimitRemoveMessage",
                    String(MAX_ATTACHMENTS_PER_MESSAGE),
                    `You can only attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message. Remove some and try again.`
                )
            );
            return;
        }

        const selectedFiles = files.slice(0, availableSlots);
        const rejectedFiles = [];

        for (const file of selectedFiles) {
            if (!(file instanceof File)) {
                continue;
            }

            if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) {
                rejectedFiles.push(file.name || getI18nMessage("popupUnnamedFileLabel", null, "unnamed file"));
                continue;
            }

            try {
                const dataUrl = await readFileAsDataUrl(file);
                this.state.pendingAttachments.push({
                    fileName: sanitizeAttachmentFileName(file.name),
                    mimeType: typeof file.type === "string" ? file.type : "",
                    dataUrl: dataUrl,
                    isImage: typeof file.type === "string" && file.type.startsWith("image/"),
                });
            } catch {
                rejectedFiles.push(file.name || getI18nMessage("popupUnnamedFileLabel", null, "unnamed file"));
            }
        }

        this.renderAttachmentState();
        this.updateComposerState();

        if (rejectedFiles.length > 0) {
            const skippedFilesLabel = rejectedFiles.join(", ");
            this.appendMessage(
                "system",
                getI18nMessage(
                    "popupAttachmentSkippedFilesMessage",
                    [String(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)), skippedFilesLabel],
                    `Some files were skipped (max 10MB each): ${skippedFilesLabel}`
                )
            );
        }
    }

    handleFileDragEnter(event) {
        if (!isFileDragEvent(event)) {
            return;
        }

        event.preventDefault();
        this.fileDragDepth += 1;
        if (!this.state.isAwaitingResponse) {
            this.setFileDropOverlayVisible(true);
        }
    }

    handleFileDragOver(event) {
        if (!isFileDragEvent(event)) {
            return;
        }

        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = this.state.isAwaitingResponse ? "none" : "copy";
        }

        if (!this.state.isAwaitingResponse) {
            this.setFileDropOverlayVisible(true);
        }
    }

    handleFileDragLeave(event) {
        if (!isFileDragEvent(event)) {
            return;
        }

        event.preventDefault();
        this.fileDragDepth = Math.max(0, this.fileDragDepth - 1);
        if (this.fileDragDepth === 0) {
            this.setFileDropOverlayVisible(false);
        }
    }

    handleFileDrop(event) {
        if (!isFileDragEvent(event)) {
            return;
        }

        event.preventDefault();
        this.fileDragDepth = 0;
        this.setFileDropOverlayVisible(false);

        if (this.state.isAwaitingResponse) {
            return;
        }

        const droppedFiles = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
        void this.addPendingAttachmentsFromFiles(droppedFiles);
    }

    setFileDropOverlayVisible(visible) {
        if (!(this.dom.fileDropOverlay instanceof HTMLElement)) {
            return;
        }

        this.dom.fileDropOverlay.hidden = !visible;
    }

    stopCurrentResponse() {
        if (!this.state.isAwaitingResponse) {
            return;
        }

        chrome.runtime.sendMessage({ stopResponse: true });
    }

    handleRuntimeMessage(message) {
        if (!message || typeof message !== "object") {
            return false;
        }

        if (isStreamPayload(message.stream)) {
            this.handleStreamMessage(message.stream);
            return false;
        }

        if (typeof message.error === "string" && message.error.length > 0) {
            this.reportSystemError(message.error);
            return false;
        }

        if (typeof message.answer === "string" && message.answer.length > 0) {
            this.completeAssistantStream(message.answer);
            return false;
        }

        if (typeof message.imageUrl === "string" && message.imageUrl.length > 0) {
            this.completeAssistantImage(message.imageUrl);
            this.setAwaitingResponse(false);
            return false;
        }

        return false;
    }

    handleStreamMessage(streamPayload) {
        if (streamPayload.type === "start") {
            this.beginAssistantStream();
            return;
        }

        if (streamPayload.type === "delta" && typeof streamPayload.delta === "string") {
            this.appendAssistantStreamDelta(streamPayload.delta);
            return;
        }

        if (streamPayload.type === "done") {
            this.completeAssistantStream(streamPayload.text);
        }
    }

    appendMessage(role, content) {
        const messageElement = document.createElement("div");
        messageElement.classList.add("chat-entry", role);
        if (role === "user") {
            messageElement.classList.add("message");
        }

        const userPreviewContent = role === "user"
            ? resolveUserPreviewContent(content)
            : null;

        if (userPreviewContent) {
            this.appendUserMessagePreview(messageElement, userPreviewContent);
        } else if (isImageContent(content)) {
            const image = document.createElement("img");
            if (role === "assistant") {
                image.className = "assistant-generated-image";
            }
            image.src = content;
            messageElement.appendChild(image);

            if (role === "assistant") {
                this.attachImageActions(messageElement, content);
            }
        } else {
            const targetElement = role === "assistant"
                ? document.createElement("div")
                : messageElement;

            this.appendFormattedText(targetElement, content, { enableLinks: role === "assistant" });

            if (role === "assistant") {
                messageElement.appendChild(targetElement);
            }

            if (role === "assistant") {
                this.attachAssistantTextActions(messageElement, content);
            }
        }

        this.dom.chatMessages.appendChild(messageElement);

        if (role === "user") {
            this.updateUserMessageShape(messageElement, userPreviewContent || content);
        }

        this.updateClearChatButtonState();
        messageElement.scrollIntoView();
    }

    appendUserMessagePreview(messageElement, previewContent) {
        const wrapper = document.createElement("div");
        wrapper.className = "user-preview-content";

        if (typeof previewContent.text === "string" && previewContent.text.trim().length > 0) {
            const textElement = document.createElement("div");
            textElement.className = "user-preview-text";
            this.appendFormattedText(textElement, previewContent.text.trim());
            wrapper.appendChild(textElement);
        }

        if (Array.isArray(previewContent.attachments) && previewContent.attachments.length > 0) {
            const attachmentList = document.createElement("div");
            attachmentList.className = "user-attachment-list";

            for (const attachment of previewContent.attachments) {
                if (!attachment || typeof attachment !== "object") {
                    continue;
                }

                if (attachment.isImage && typeof attachment.dataUrl === "string" && attachment.dataUrl.length > 0) {
                    const imageElement = document.createElement("img");
                    imageElement.className = "user-attachment-image";
                    imageElement.src = attachment.dataUrl;
                    imageElement.alt = sanitizeAttachmentFileName(attachment.fileName);
                    attachmentList.appendChild(imageElement);
                    continue;
                }

                if (typeof attachment.summaryLabel === "string" && attachment.summaryLabel.length > 0) {
                    const pillElement = document.createElement("span");
                    pillElement.className = "user-attachment-pill";
                    pillElement.innerText = attachment.summaryLabel;

                    if (typeof attachment.fileName === "string" && attachment.fileName.length > 0) {
                        pillElement.title = sanitizeAttachmentFileName(attachment.fileName);
                    }

                    attachmentList.appendChild(pillElement);
                    continue;
                }

                const fileElement = document.createElement("div");
                fileElement.className = "user-attachment-file";

                const iconElement = document.createElement("i");
                iconElement.className = "fa fa-file";
                fileElement.appendChild(iconElement);

                const nameElement = document.createElement("span");
                nameElement.className = "user-attachment-name";
                nameElement.innerText = sanitizeAttachmentFileName(attachment.fileName);
                fileElement.appendChild(nameElement);

                attachmentList.appendChild(fileElement);
            }

            if (attachmentList.childNodes.length > 0) {
                wrapper.appendChild(attachmentList);
            }
        }

        if (wrapper.childNodes.length === 0) {
            wrapper.appendChild(document.createTextNode(""));
        }

        messageElement.appendChild(wrapper);
    }

    beginAssistantStream() {
        if (this.state.streamingAssistantMessage) {
            return;
        }

        const pendingMessage = this.consumePendingAssistantMessage();
        if (pendingMessage) {
            this.state.streamingAssistantMessage = {
                messageElement: pendingMessage.messageElement,
                contentElement: pendingMessage.contentElement,
                text: "",
            };
            pendingMessage.messageElement.scrollIntoView();
            return;
        }

        const messageElement = document.createElement("div");
        messageElement.classList.add("chat-entry", "assistant");

        const contentElement = document.createElement("div");
        this.renderLoadingIndicator(contentElement, getI18nMessage("popupWaitingForResponse", null, "Waiting for response..."));
        messageElement.appendChild(contentElement);

        this.dom.chatMessages.appendChild(messageElement);
        this.state.streamingAssistantMessage = {
            messageElement: messageElement,
            contentElement: contentElement,
            text: "",
        };

        this.updateClearChatButtonState();
        messageElement.scrollIntoView();
    }

    appendAssistantStreamDelta(delta) {
        if (!this.state.streamingAssistantMessage) {
            this.beginAssistantStream();
        }

        const streamMessage = this.state.streamingAssistantMessage;
        streamMessage.text += delta;
        streamMessage.contentElement.innerHTML = "";
        this.appendFormattedText(streamMessage.contentElement, streamMessage.text, { enableLinks: true });
        streamMessage.messageElement.scrollIntoView();
    }

    completeAssistantStream(fallbackText) {
        const streamMessage = this.state.streamingAssistantMessage;

        if (!streamMessage) {
            this.removePendingAssistantMessage();
            if (typeof fallbackText === "string" && fallbackText.length > 0) {
                this.appendMessage("assistant", fallbackText);
            }
            this.setAwaitingResponse(false);
            return;
        }

        if (streamMessage.text.length === 0 && typeof fallbackText === "string" && fallbackText.length > 0) {
            streamMessage.text = fallbackText;
            streamMessage.contentElement.innerHTML = "";
            this.appendFormattedText(streamMessage.contentElement, streamMessage.text, { enableLinks: true });
        }

        if (streamMessage.text.length === 0) {
            streamMessage.messageElement.remove();
            this.state.streamingAssistantMessage = null;
            this.updateClearChatButtonState();
            this.setAwaitingResponse(false);
            return;
        }

        if (streamMessage.text.length > 0) {
            this.attachAssistantTextActions(streamMessage.messageElement, streamMessage.text);
        }

        this.state.streamingAssistantMessage = null;
        this.setAwaitingResponse(false);
    }

    appendFormattedText(container, text, options) {
        const segments = parseCodeFenceSegments(text);
        const fragment = document.createDocumentFragment();

        for (const segment of segments) {
            if (segment.type === "text") {
                appendPlainText(fragment, segment.value, options);
                continue;
            }

            const codeElement = document.createElement("code");
            applyCodeHighlighting(codeElement, segment.value.replace(/^\n/, ""), segment.language);

            const codeContainer = document.createElement("pre");
            codeContainer.className = "code-block";
            codeContainer.appendChild(codeElement);
            fragment.appendChild(codeContainer);
        }

        container.appendChild(fragment);
    }

    attachImageActions(messageElement, imageUrl) {
        const existingActions = messageElement.querySelector(".assistant-action-row");
        if (existingActions) {
            existingActions.remove();
        }

        const actionRow = document.createElement("div");
        actionRow.className = "assistant-action-row";

        const downloadButton = this.createAssistantActionButton(
            "fa-download",
            getI18nMessage("popupDownloadLabel", null, "Download"),
            getI18nMessage("popupDownloadTitle", null, "Download image")
        );
        downloadButton.addEventListener("click", () => {
            void this.runButtonAction(downloadButton, async () => {
                await chrome.downloads.download({
                    url: imageUrl,
                    filename: "openai-image.png",
                    saveAs: false,
                });
            }, {
                success: getI18nMessage("popupActionSavedLabel", null, "Saved"),
                error: getI18nMessage("popupActionFailedLabel", null, "Failed"),
            });
        });

        const regenerateButton = this.createAssistantActionButton(
            "fa-rotate-right",
            getI18nMessage("popupRegenerateLabel", null, "Regenerate"),
            getI18nMessage("popupRegenerateTitle", null, "Regenerate response")
        );
        regenerateButton.addEventListener("click", () => {
            void this.regenerateLastResponse(regenerateButton, messageElement);
        });

        actionRow.appendChild(downloadButton);
        actionRow.appendChild(regenerateButton);
        messageElement.appendChild(actionRow);
    }

    completeAssistantImage(imageUrl) {
        if (this.state.streamingAssistantMessage) {
            const streamMessage = this.state.streamingAssistantMessage;
            this.state.streamingAssistantMessage = null;
            streamMessage.messageElement.innerHTML = "";

            const image = document.createElement("img");
            image.className = "assistant-generated-image";
            image.src = imageUrl;
            streamMessage.messageElement.appendChild(image);
            this.attachImageActions(streamMessage.messageElement, imageUrl);
            streamMessage.messageElement.scrollIntoView();
            return;
        }

        this.removePendingAssistantMessage();
        this.appendMessage("assistant", imageUrl);
    }

    showPendingAssistantMessage() {
        if (this.state.pendingAssistantMessage || this.state.streamingAssistantMessage) {
            return;
        }

        const messageElement = document.createElement("div");
        messageElement.classList.add("chat-entry", "assistant");

        const contentElement = document.createElement("div");
        this.renderLoadingIndicator(contentElement, getI18nMessage("popupWaitingForResponse", null, "Waiting for response..."));
        messageElement.appendChild(contentElement);

        this.dom.chatMessages.appendChild(messageElement);
        this.state.pendingAssistantMessage = {
            messageElement,
            contentElement,
        };

        this.updateClearChatButtonState();
        messageElement.scrollIntoView();
    }

    consumePendingAssistantMessage() {
        const pendingMessage = this.state.pendingAssistantMessage;
        if (!pendingMessage) {
            return null;
        }

        this.state.pendingAssistantMessage = null;
        return pendingMessage;
    }

    removePendingAssistantMessage() {
        const pendingMessage = this.state.pendingAssistantMessage;
        if (!pendingMessage) {
            return;
        }

        pendingMessage.messageElement.remove();
        this.state.pendingAssistantMessage = null;
        this.updateClearChatButtonState();
    }

    renderLoadingIndicator(containerElement, label) {
        if (!(containerElement instanceof HTMLElement)) {
            return;
        }

        containerElement.innerHTML = "";

        const loadingWrapper = document.createElement("div");
        loadingWrapper.className = "assistant-loading-indicator";

        const spinner = document.createElement("span");
        spinner.className = "assistant-loading-spinner";
        spinner.setAttribute("aria-hidden", "true");
        loadingWrapper.appendChild(spinner);

        const loadingLabel = document.createElement("span");
        loadingLabel.className = "assistant-loading-label";
        loadingLabel.innerText = typeof label === "string" && label.trim().length > 0
            ? label
            : getI18nMessage("popupLoadingLabel", null, "Loading...");
        loadingWrapper.appendChild(loadingLabel);

        containerElement.appendChild(loadingWrapper);
    }

    attachAssistantTextActions(messageElement, rawText) {
        const existingActions = messageElement.querySelector(".assistant-action-row");
        if (existingActions) {
            existingActions.remove();
        }

        const actionRow = document.createElement("div");
        actionRow.className = "assistant-action-row";

        const copyButton = this.createAssistantActionButton(
            "fa-copy",
            getI18nMessage("popupCopyLabel", null, "Copy"),
            getI18nMessage("popupCopyTitle", null, "Copy response")
        );
        copyButton.addEventListener("click", () => {
            void this.runButtonAction(copyButton, async () => {
                await navigator.clipboard.writeText(rawText);
            }, {
                success: getI18nMessage("popupCopiedLabel", null, "Copied"),
                error: getI18nMessage("popupActionFailedLabel", null, "Failed"),
            });
        });

        const regenerateButton = this.createAssistantActionButton(
            "fa-rotate-right",
            getI18nMessage("popupRegenerateLabel", null, "Regenerate"),
            getI18nMessage("popupRegenerateTitle", null, "Regenerate response")
        );
        regenerateButton.addEventListener("click", () => {
            void this.regenerateLastResponse(regenerateButton, messageElement);
        });

        actionRow.appendChild(copyButton);
        actionRow.appendChild(regenerateButton);
        messageElement.appendChild(actionRow);
    }

    createAssistantActionButton(iconClass, label, title) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "assistant-action-btn";
        button.title = title;

        const icon = document.createElement("i");
        icon.className = `fa ${iconClass}`;
        button.appendChild(icon);

        const text = document.createElement("span");
        text.innerText = label;
        button.appendChild(text);

        return button;
    }

    async regenerateLastResponse(buttonElement, targetMessageElement) {
        if (this.state.isAwaitingResponse) {
            return;
        }

        if (!this.state.activeChatId) {
            return;
        }

        this.prepareRegenerateTarget(targetMessageElement);
        this.setAwaitingResponse(true);
        buttonElement.disabled = true;

        chrome.runtime.sendMessage({ regenerate: true, chatId: this.state.activeChatId }, () => {
            buttonElement.disabled = false;
            if (chrome.runtime.lastError) {
                this.reportSystemError(getI18nMessage("popupErrorRegenerateFailed", null, "Failed to regenerate response. Please try again."));
            }
        });
    }

    prepareRegenerateTarget(messageElement) {
        if (!messageElement || !(messageElement instanceof HTMLElement)) {
            return;
        }

        const existingActions = messageElement.querySelector(".assistant-action-row");
        if (existingActions) {
            existingActions.remove();
        }

        messageElement.innerHTML = "";
        const contentElement = document.createElement("div");
        this.renderLoadingIndicator(contentElement, getI18nMessage("popupWaitingForResponse", null, "Waiting for response..."));
        messageElement.appendChild(contentElement);

        this.state.streamingAssistantMessage = {
            messageElement: messageElement,
            contentElement: contentElement,
            text: "",
        };

        messageElement.scrollIntoView();
    }

    async runButtonAction(buttonElement, action, feedbackLabels) {
        if (buttonElement.disabled) {
            return;
        }

        const successLabel = feedbackLabels && typeof feedbackLabels.success === "string"
            ? feedbackLabels.success
            : getI18nMessage("popupCopiedLabel", null, "Copied");
        const errorLabel = feedbackLabels && typeof feedbackLabels.error === "string"
            ? feedbackLabels.error
            : getI18nMessage("popupActionFailedLabel", null, "Failed");
        const originalHtml = buttonElement.innerHTML;
        buttonElement.disabled = true;

        try {
            await action();
            buttonElement.classList.add("success");
            const label = buttonElement.querySelector("span");
            if (label) {
                label.innerText = successLabel;
            }
        } catch {
            buttonElement.classList.add("error");
            const label = buttonElement.querySelector("span");
            if (label) {
                label.innerText = errorLabel;
            }
        }

        setTimeout(() => {
            buttonElement.disabled = false;
            buttonElement.classList.remove("success", "error");
            buttonElement.innerHTML = originalHtml;
        }, 1200);
    }

    async clearChatHistory() {
        const isConfirmed = window.confirm(getI18nMessage("popupClearConfirm", null, "Are you sure you want to clear the chat history?"));
        if (!isConfirmed) {
            return;
        }

        try {
            const sessionIndex = this.state.chatSessions.findIndex((session) => session.id === this.state.activeChatId);
            if (sessionIndex === -1) {
                return;
            }

            const nextSessions = this.state.chatSessions.slice();
            const currentSession = nextSessions[sessionIndex];
            nextSessions[sessionIndex] = {
                ...currentSession,
                history: [],
                updatedAt: Date.now(),
            };

            this.state.chatSessions = normalizeChatSessionsForUi(nextSessions);
            await this.persistChatState();
            this.dom.chatMessages.innerHTML = "";
            this.state.pendingAssistantMessage = null;
            this.state.streamingAssistantMessage = null;
            this.clearPendingAttachments();
            this.renderChatOptions();
            this.showAssistantInfo();
            this.updateClearChatButtonState();
            this.updateComposerState();
        } catch (error) {
            this.reportSystemError(getSafeErrorMessage(error));
        }
    }

    setAwaitingResponse(isAwaitingResponse) {
        this.state.isAwaitingResponse = isAwaitingResponse;
        this.dom.userInput.disabled = isAwaitingResponse;
        this.dom.attachBtn.disabled = isAwaitingResponse;
        this.dom.chatDropdownBtn.disabled = isAwaitingResponse;
        this.dom.newChatBtn.disabled = isAwaitingResponse;
        this.dom.sendBtn.innerHTML = isAwaitingResponse ? STOP_ICON_HTML : SEND_ICON_HTML;
        this.dom.sendBtn.title = isAwaitingResponse
            ? getI18nMessage("popupStopTitle", null, "Stop response")
            : getI18nMessage("popupSendTitle", null, "Send message");

        if (!isAwaitingResponse) {
            this.removePendingAssistantMessage();
        } else {
            this.fileDragDepth = 0;
            this.setFileDropOverlayVisible(false);
        }

        this.updateComposerState();
    }

    updateComposerState() {
        const hasInput = this.dom.userInput.value.trim().length > 0;
        const hasAttachments = this.state.pendingAttachments.length > 0;
        const hasReachedAttachmentLimit = this.state.pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE;

        this.dom.attachBtn.disabled = this.state.isAwaitingResponse || hasReachedAttachmentLimit;
        this.dom.sendBtn.disabled = this.state.isAwaitingResponse ? false : !(hasInput || hasAttachments);
    }

    autoResizeInput() {
        this.dom.userInput.style.height = "auto";
        const nextHeight = Math.min(this.dom.userInput.scrollHeight, 100);
        this.dom.userInput.style.height = `${nextHeight}px`;
        this.dom.userInput.style.overflowY = this.dom.userInput.scrollHeight > 100 ? "scroll" : "auto";
        this.dom.userInput.classList.toggle("multiline", isTextareaMultiline(this.dom.userInput));
    }

    renderChatOptions() {
        this.dom.chatDropdownContent.innerHTML = "";

        const sessions = normalizeChatSessionsForUi(this.state.chatSessions);
        const hasEditingSession = sessions.some((session) => session.id === this.state.editingChatId);
        if (!hasEditingSession) {
            this.state.editingChatId = "";
        }

        const pinnedSessions = sessions.filter((session) => Boolean(session.pinned));
        const regularSessions = sessions.filter((session) => !session.pinned);
        const sessionIndexById = new Map(sessions.map((session, index) => [session.id, index]));

        const renderSection = (labelKey, labelFallback, sectionSessions) => {
            if (!Array.isArray(sectionSessions) || sectionSessions.length === 0) {
                return;
            }

            const sectionLabel = document.createElement("div");
            sectionLabel.className = "dropdown-group-label";
            sectionLabel.innerText = getI18nMessage(labelKey, null, labelFallback);
            this.dom.chatDropdownContent.appendChild(sectionLabel);

            for (const session of sectionSessions) {
                const option = document.createElement("div");
                option.className = "dropdown-option chat-dropdown-option";
                option.dataset.chatId = session.id;
                option.addEventListener("click", () => {
                    void this.setActiveChatSession(session.id, true);
                    this.closeDropdown(this.dom.chatDropdownBtn, this.dom.chatDropdownContent);
                });

                const sessionIndex = sessionIndexById.has(session.id) ? sessionIndexById.get(session.id) : 0;
                const chatTitle = getSessionDisplayTitle(session, sessionIndex);
                const isEditing = this.state.editingChatId === session.id;

                if (isEditing) {
                    option.classList.add("editing");
                    const inputElement = document.createElement("input");
                    inputElement.type = "text";
                    inputElement.maxLength = 80;
                    inputElement.className = "chat-dropdown-option-input";
                    inputElement.value = typeof session.title === "string" ? session.title : "";
                    inputElement.placeholder = chatTitle;
                    inputElement.setAttribute("aria-label", getI18nMessage("popupRenameChatTitle", null, "Rename chat"));

                    inputElement.addEventListener("click", (event) => {
                        event.stopPropagation();
                    });
                    inputElement.addEventListener("keydown", (event) => {
                        event.stopPropagation();

                        if (event.key === "Enter") {
                            event.preventDefault();
                            void this.commitInlineRename(session.id, inputElement.value);
                            return;
                        }

                        if (event.key === "Escape") {
                            event.preventDefault();
                            this.cancelInlineRename();
                        }
                    });
                    inputElement.addEventListener("blur", () => {
                        void this.commitInlineRename(session.id, inputElement.value);
                    });
                    option.appendChild(inputElement);

                    requestAnimationFrame(() => {
                        inputElement.focus();
                        inputElement.select();
                    });
                } else {
                    const titleElement = document.createElement("span");
                    titleElement.className = "chat-dropdown-option-title";
                    titleElement.innerText = chatTitle;
                    option.appendChild(titleElement);
                }

                const actionsElement = document.createElement("div");
                actionsElement.className = "chat-dropdown-option-actions";

                const renameButton = document.createElement("button");
                renameButton.type = "button";
                renameButton.className = "chat-dropdown-option-action chat-dropdown-option-rename";
                const renameButtonLabel = isEditing
                    ? getI18nMessage("popupSaveChatTitle", null, "Save chat name")
                    : getI18nMessage("popupRenameChatTitle", null, "Rename chat");
                renameButton.innerHTML = isEditing
                    ? '<i class="fa fa-check"></i>'
                    : '<i class="fa fa-pen"></i>';
                renameButton.title = renameButtonLabel;
                renameButton.setAttribute("aria-label", renameButtonLabel);
                renameButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isEditing) {
                        const inputElement = option.querySelector(".chat-dropdown-option-input");
                        const nextTitle = inputElement instanceof HTMLInputElement ? inputElement.value : "";
                        void this.commitInlineRename(session.id, nextTitle);
                        return;
                    }

                    this.startInlineRename(session.id);
                });
                actionsElement.appendChild(renameButton);

                const pinButton = document.createElement("button");
                pinButton.type = "button";
                pinButton.className = "chat-dropdown-option-action chat-dropdown-option-pin";
                pinButton.innerHTML = '<i class="fa fa-thumbtack"></i>';
                pinButton.classList.toggle("active", Boolean(session.pinned));
                const pinButtonLabel = session.pinned
                    ? getI18nMessage("popupUnpinChatTitle", null, "Unpin chat")
                    : getI18nMessage("popupPinChatTitle", null, "Pin chat");
                pinButton.title = pinButtonLabel;
                pinButton.setAttribute("aria-label", pinButtonLabel);
                pinButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void this.toggleChatSessionPinned(session.id);
                });
                actionsElement.appendChild(pinButton);

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "chat-dropdown-option-action chat-dropdown-option-delete";
                deleteButton.innerHTML = '<i class="fa fa-trash"></i>';
                deleteButton.title = getI18nMessage("popupDeleteChatTitle", null, "Delete chat");
                deleteButton.setAttribute("aria-label", getI18nMessage("popupDeleteChatTitle", null, "Delete chat"));
                deleteButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void this.deleteChatSession(session.id);
                });
                actionsElement.appendChild(deleteButton);
                option.appendChild(actionsElement);

                this.dom.chatDropdownContent.appendChild(option);
            }
        };

        if (pinnedSessions.length > 0) {
            renderSection("popupPinnedChatsGroupLabel", "Pinned chats", pinnedSessions);
            renderSection("popupChatGroupLabel", "Chats", regularSessions);
        } else {
            renderSection("popupChatGroupLabel", "Chats", regularSessions);
        }

        this.dom.chatDropdownContent.querySelectorAll(".dropdown-option").forEach((option) => {
            option.classList.toggle("active", option.dataset.chatId === this.state.activeChatId);
        });

        const activeSessionIndex = sessions.findIndex((session) => session.id === this.state.activeChatId);
        const activeSession = activeSessionIndex >= 0 ? sessions[activeSessionIndex] : null;
        setElementText(
            this.dom.chatDropdownBtnText,
            activeSession
                ? getSessionDisplayTitle(activeSession, activeSessionIndex)
                : getI18nMessage("popupChatFallbackLabel", null, "Chat")
        );
    }

    renderActiveChatHistory() {
        this.dom.chatMessages.innerHTML = "";

        const activeSession = this.getActiveChatSession();
        const history = activeSession && Array.isArray(activeSession.history)
            ? activeSession.history
            : [];

        for (const entry of history) {
            if (!entry || typeof entry.content !== "string" || !isRenderableRole(entry.role)) {
                continue;
            }

            this.appendMessage(entry.role, entry.content);
        }

        if (this.getMessageCount() === 0) {
            this.showAssistantInfo();
        } else {
            this.hideAssistantInfo();
            this.scrollChatToBottom();
        }

        this.updateClearChatButtonState();
    }

    getActiveChatSession() {
        return this.state.chatSessions.find((session) => session.id === this.state.activeChatId) || null;
    }

    async setActiveChatSession(chatId, persist) {
        if (typeof chatId !== "string" || chatId.length === 0) {
            return;
        }

        const hasSession = this.state.chatSessions.some((session) => session.id === chatId);
        if (!hasSession) {
            return;
        }

        const prunedState = pruneEmptyChatSessions(this.state.chatSessions, chatId, false);
        this.state.chatSessions = prunedState.sessions;
        this.state.activeChatId = prunedState.activeChatId;
        this.state.editingChatId = "";
        this.renderChatOptions();
        this.renderActiveChatHistory();

        if (persist || prunedState.changed) {
            await this.persistChatState();
        }
    }

    async createNewChat(persist) {
        if (this.state.isAwaitingResponse) {
            return;
        }

        const activeSession = this.getActiveChatSession();
        if (isChatSessionEmpty(activeSession)) {
            this.renderChatOptions();
            this.renderActiveChatHistory();
            this.updateComposerState();
            return;
        }

        const prunedState = pruneEmptyChatSessions(this.state.chatSessions, this.state.activeChatId, false);
        this.state.chatSessions = prunedState.sessions;
        this.state.activeChatId = prunedState.activeChatId;
        this.state.editingChatId = "";

        const timestamp = Date.now();
        const newSession = {
            id: createChatSessionId(),
            title: "",
            history: [],
            pinned: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const nextSessions = [newSession].concat(this.state.chatSessions);
        this.state.chatSessions = normalizeChatSessionsForUi(nextSessions).slice(0, MAX_CHAT_SESSIONS);
        this.state.activeChatId = newSession.id;

        if (persist) {
            await this.persistChatState();
        }

        this.dom.chatMessages.innerHTML = "";
        this.renderChatOptions();
        this.showAssistantInfo();
        this.updateClearChatButtonState();
        this.updateComposerState();
    }

    async deleteChatSession(chatId) {
        if (this.state.isAwaitingResponse || typeof chatId !== "string" || chatId.length === 0) {
            return;
        }

        const sessionExists = this.state.chatSessions.some((session) => session.id === chatId);
        if (!sessionExists) {
            return;
        }

        let nextSessions = this.state.chatSessions.filter((session) => session.id !== chatId);
        nextSessions = normalizeChatSessionsForUi(nextSessions);

        if (nextSessions.length === 0) {
            const timestamp = Date.now();
            nextSessions = [{
                id: createChatSessionId(),
                title: "",
                history: [],
                pinned: false,
                createdAt: timestamp,
                updatedAt: timestamp,
            }];
        }

        const nextActiveChatId = this.state.activeChatId === chatId
            ? nextSessions[0].id
            : this.state.activeChatId;

        this.state.chatSessions = nextSessions;
        this.state.activeChatId = nextActiveChatId;
        if (this.state.editingChatId === chatId) {
            this.state.editingChatId = "";
        }
        await this.persistChatState();
        this.renderChatOptions();
        this.renderActiveChatHistory();
        this.updateComposerState();
    }

    startInlineRename(chatId) {
        if (this.state.isAwaitingResponse || typeof chatId !== "string" || chatId.length === 0) {
            return;
        }

        const sessionExists = this.state.chatSessions.some((session) => session.id === chatId);
        if (!sessionExists) {
            return;
        }

        this.state.editingChatId = chatId;
        this.renderChatOptions();
    }

    cancelInlineRename() {
        if (!this.state.editingChatId) {
            return;
        }

        this.state.editingChatId = "";
        this.renderChatOptions();
    }

    async commitInlineRename(chatId, rawTitle) {
        if (typeof chatId !== "string" || chatId.length === 0) {
            this.cancelInlineRename();
            return;
        }

        const sessionIndex = this.state.chatSessions.findIndex((session) => session.id === chatId);
        if (sessionIndex === -1) {
            this.cancelInlineRename();
            return;
        }

        const currentSession = this.state.chatSessions[sessionIndex];
        const currentTitle = typeof currentSession.title === "string" ? currentSession.title : "";
        const normalizedTitle = typeof rawTitle === "string" ? rawTitle.trim().slice(0, 80) : "";

        this.state.editingChatId = "";
        if (normalizedTitle === currentTitle) {
            this.renderChatOptions();
            return;
        }

        const nextSessions = this.state.chatSessions.slice();
        nextSessions[sessionIndex] = {
            ...currentSession,
            title: normalizedTitle,
            updatedAt: Date.now(),
        };

        this.state.chatSessions = normalizeChatSessionsForUi(nextSessions);
        await this.persistChatState();
        this.renderChatOptions();
    }

    async toggleChatSessionPinned(chatId) {
        if (this.state.isAwaitingResponse || typeof chatId !== "string" || chatId.length === 0) {
            return;
        }

        const sessionIndex = this.state.chatSessions.findIndex((session) => session.id === chatId);
        if (sessionIndex === -1) {
            return;
        }

        const nextSessions = this.state.chatSessions.slice();
        const targetSession = { ...nextSessions[sessionIndex] };
        targetSession.pinned = !Boolean(targetSession.pinned);
        targetSession.updatedAt = Date.now();
        nextSessions[sessionIndex] = targetSession;

        this.state.chatSessions = normalizeChatSessionsForUi(nextSessions);
        await this.persistChatState();
        this.renderChatOptions();
    }

    touchActiveChatSession(userMessage) {
        const sessionIndex = this.state.chatSessions.findIndex((session) => session.id === this.state.activeChatId);
        if (sessionIndex === -1) {
            return;
        }

        const nextSessions = this.state.chatSessions.slice();
        const activeSession = { ...nextSessions[sessionIndex] };
        activeSession.updatedAt = Date.now();

        const generatedTitle = generateChatTitleFromUserMessage(userMessage);
        if (!activeSession.title && generatedTitle) {
            activeSession.title = generatedTitle;
        }

        nextSessions[sessionIndex] = activeSession;
        this.state.chatSessions = normalizeChatSessionsForUi(nextSessions);
        this.renderChatOptions();
        void this.persistChatState().catch((error) => {
            this.reportSystemError(getSafeErrorMessage(error));
        });
    }

    async persistChatState() {
        await setStorageData({
            [STORAGE_KEYS.CHAT_SESSIONS]: this.state.chatSessions,
            [STORAGE_KEYS.ACTIVE_CHAT_ID]: this.state.activeChatId,
        });
    }

    renderModelOptions() {
        this.dom.modelDropdownContent.innerHTML = "";
        const groupedModels = groupModelsByType(MODELS);

        for (const group of groupedModels) {
            const sectionLabel = document.createElement("div");
            sectionLabel.className = "dropdown-group-label";
            sectionLabel.innerText = getLocalizedModelGroupLabel(group.type);
            this.dom.modelDropdownContent.appendChild(sectionLabel);

            for (const model of group.models) {
                const option = document.createElement("a");
                option.className = "dropdown-option model-dropdown-option";
                option.dataset.modelId = model.id;
                option.addEventListener("click", () => {
                    this.setSelectedModel(model.id, true);
                    this.syncThinkingDropdownVisibility();
                    this.closeDropdown(this.dom.modelDropdownBtn, this.dom.modelDropdownContent);
                });

                const optionLabel = document.createElement("span");
                optionLabel.className = "dropdown-option-label";
                optionLabel.innerText = model.label;
                option.appendChild(optionLabel);

                const optionTypeBadge = document.createElement("span");
                optionTypeBadge.className = "dropdown-option-type-badge";
                optionTypeBadge.innerText = getLocalizedModelTypeLabel(model.type);
                option.appendChild(optionTypeBadge);

                this.dom.modelDropdownContent.appendChild(option);
            }
        }
    }

    renderThinkingOptions() {
        this.dom.thinkingDropdownContent.innerHTML = "";

        const thinkingOptions = getThinkingLevelOptions(this.state.selectedModelId);
        for (const thinkingLevel of thinkingOptions) {
            const option = document.createElement("a");
            option.className = "dropdown-option";
            option.innerText = thinkingLevel.label;
            option.dataset.thinkingLevel = thinkingLevel.id;
            option.addEventListener("click", () => {
                this.setSelectedThinkingLevel(thinkingLevel.id, true);
                this.closeDropdown(this.dom.thinkingDropdownBtn, this.dom.thinkingDropdownContent);
            });
            this.dom.thinkingDropdownContent.appendChild(option);
        }
    }

    setSelectedModel(modelId, persist) {
        this.state.selectedModelId = getValidModelId(modelId);
        const modelInfo = getModelById(this.state.selectedModelId) || getModelById(DEFAULT_MODEL_ID);
        setElementText(this.dom.modelDropdownBtnText, modelInfo.label);

        this.dom.modelDropdownContent.querySelectorAll(".dropdown-option").forEach((option) => {
            option.classList.toggle("active", option.dataset.modelId === this.state.selectedModelId);
        });

        this.renderThinkingOptions();
        this.setSelectedThinkingLevel(this.state.selectedThinkingLevel, false);
        this.syncWebSearchToggleVisibility();

        if (persist) {
            void setStorageData({
                [STORAGE_KEYS.MODEL]: this.state.selectedModelId,
                [STORAGE_KEYS.THINKING]: this.state.selectedThinkingLevel,
            }).catch((error) => {
                this.reportSystemError(getSafeErrorMessage(error));
            });
        }
    }

    setSelectedThinkingLevel(thinkingLevel, persist) {
        this.state.selectedThinkingLevel = getValidThinkingLevel(thinkingLevel, this.state.selectedModelId);
        const thinkingLabel = getThinkingLabel(this.state.selectedThinkingLevel, this.state.selectedModelId);
        setElementText(this.dom.thinkingDropdownBtnText, getI18nMessage("popupThinkLabelTemplate", thinkingLabel, thinkingLabel));

        this.dom.thinkingDropdownContent.querySelectorAll(".dropdown-option").forEach((option) => {
            option.classList.toggle("active", option.dataset.thinkingLevel === this.state.selectedThinkingLevel);
        });

        if (persist) {
            void setStorageData({ [STORAGE_KEYS.THINKING]: this.state.selectedThinkingLevel }).catch((error) => {
                this.reportSystemError(getSafeErrorMessage(error));
            });
        }
    }

    syncThinkingDropdownVisibility() {
        const isThinkingSupported = supportsThinking(this.state.selectedModelId);
        this.dom.thinkingDropdown.hidden = !isThinkingSupported;

        if (!isThinkingSupported) {
            this.closeDropdown(this.dom.thinkingDropdownBtn, this.dom.thinkingDropdownContent);
            return;
        }

        this.renderThinkingOptions();
        this.setSelectedThinkingLevel(this.state.selectedThinkingLevel, false);
    }

    setWebSearchEnabled(webSearchEnabled, persist) {
        this.state.webSearchEnabled = getValidWebSearchEnabled(webSearchEnabled);
        this.dom.webSearchToggleBtn.classList.toggle("toggle-on", this.state.webSearchEnabled);
        this.dom.webSearchToggleBtn.setAttribute("aria-pressed", this.state.webSearchEnabled ? "true" : "false");
        this.dom.webSearchToggleBtn.title = this.state.webSearchEnabled
            ? getI18nMessage("popupWebDisableTitle", null, "Disable web search")
            : getI18nMessage("popupWebEnableTitle", null, "Enable web search");

        if (persist) {
            void setStorageData({ [STORAGE_KEYS.WEB_SEARCH]: this.state.webSearchEnabled }).catch((error) => {
                this.reportSystemError(getSafeErrorMessage(error));
            });
        }
    }

    syncWebSearchToggleVisibility() {
        this.dom.webSearchToggleBtn.hidden = !supportsWebSearch(this.state.selectedModelId);
    }

    toggleDropdown(trigger, content) {
        const isOpen = content.style.display === "flex";
        this.closeAllDropdowns();

        if (!isOpen) {
            content.style.display = "flex";
            trigger.classList.add("active");
        }
    }

    closeAllDropdowns() {
        this.closeDropdown(this.dom.chatDropdownBtn, this.dom.chatDropdownContent);
        this.closeDropdown(this.dom.modelDropdownBtn, this.dom.modelDropdownContent);
        this.closeDropdown(this.dom.thinkingDropdownBtn, this.dom.thinkingDropdownContent);
    }

    closeDropdown(trigger, content) {
        content.style.display = "none";
        trigger.classList.remove("active");
    }

    showAssistantInfo() {
        if (document.getElementById(EMPTY_STATE_ID)) {
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.id = EMPTY_STATE_ID;

        const text = document.createElement("p");
        text.innerText = getI18nMessage("popupEmptyStateTitle", null, "How can I help you?");
        text.className = "assistant-info-text";
        wrapper.appendChild(text);

        const examplesLabel = document.createElement("p");
        examplesLabel.className = "assistant-info-examples-label";
        examplesLabel.innerText = getI18nMessage("popupEmptyStateExamplesLabel", null, "Try one of these");
        wrapper.appendChild(examplesLabel);

        const examplesRow = document.createElement("div");
        examplesRow.className = "assistant-info-examples";

        const visibleExamples = pickRandomItems(EMPTY_STATE_EXAMPLES, EMPTY_STATE_VISIBLE_EXAMPLES);
        for (const example of visibleExamples) {
            const promptText = getI18nMessage(example.key, null, example.fallback);
            if (typeof promptText !== "string" || promptText.trim().length === 0) {
                continue;
            }

            const exampleButton = document.createElement("button");
            exampleButton.type = "button";
            exampleButton.className = "assistant-info-example-btn";
            exampleButton.innerText = promptText.trim();
            exampleButton.addEventListener("click", () => {
                this.applyEmptyStateExample(promptText);
            });
            examplesRow.appendChild(exampleButton);
        }

        if (examplesRow.childNodes.length > 0) {
            wrapper.appendChild(examplesRow);
        }

        this.dom.chatMessages.appendChild(wrapper);
    }

    hideAssistantInfo() {
        const infoElement = document.getElementById(EMPTY_STATE_ID);
        if (infoElement) {
            infoElement.remove();
        }
    }

    applyEmptyStateExample(promptText) {
        const normalizedPrompt = typeof promptText === "string" ? promptText.trim() : "";
        if (normalizedPrompt.length === 0) {
            return;
        }

        this.dom.userInput.value = normalizedPrompt;
        this.autoResizeInput();
        this.updateComposerState();
        this.dom.userInput.focus();

        const cursorPosition = this.dom.userInput.value.length;
        this.dom.userInput.setSelectionRange(cursorPosition, cursorPosition);
    }

    updateClearChatButtonState() {
        if (!this.dom.clearChatBtn) {
            return;
        }

        this.dom.clearChatBtn.disabled = this.getMessageCount() === 0;
    }

    reportSystemError(message) {
        this.completeAssistantStream("");
        this.removePendingAssistantMessage();
        this.appendMessage("system", message);
        this.setAwaitingResponse(false);
    }

    getMessageCount() {
        return this.dom.chatMessages.querySelectorAll(".chat-entry").length;
    }

    scrollChatToBottom() {
        this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
    }

    applyAccentColor(accentColor) {
        const normalizedAccentColor = getValidAccentColor(accentColor);
        const textColor = getContrastingTextColor(normalizedAccentColor);

        this.state.accentColor = normalizedAccentColor;
        document.body.style.setProperty("--user-accent", normalizedAccentColor);
        document.body.style.setProperty("--user-accent-text", textColor);
    }

    async applyLanguageSetting(languagePreference) {
        const normalizedLanguagePreference = getValidLanguagePreference(languagePreference);
        await setLanguagePreference(normalizedLanguagePreference);

        this.applyLocalization();
        this.renderChatOptions();
        this.renderModelOptions();
        this.setSelectedModel(this.state.selectedModelId, false);
        this.renderThinkingOptions();
        this.setSelectedThinkingLevel(this.state.selectedThinkingLevel, false);
        this.syncThinkingDropdownVisibility();
        this.syncWebSearchToggleVisibility();
        this.renderAttachmentState();

        if (this.getMessageCount() === 0) {
            this.hideAssistantInfo();
            this.showAssistantInfo();
        }
    }

    updateUserMessageShape(messageElement, content) {
        const hasLineBreak = typeof content === "string" && content.includes("\n");
        const multiline = hasLineBreak || isElementMultiline(messageElement);
        messageElement.classList.toggle("multiline", multiline);
    }

    clearPendingAttachments() {
        this.state.pendingAttachments = [];
        this.renderAttachmentState();
    }

    renderAttachmentState() {
        const attachmentCount = this.state.pendingAttachments.length;
        const hasAttachments = attachmentCount > 0;
        const hasReachedAttachmentLimit = attachmentCount >= MAX_ATTACHMENTS_PER_MESSAGE;

        this.dom.attachmentCount.hidden = !hasAttachments;
        this.dom.attachmentCount.innerText = String(attachmentCount);
        this.dom.attachBtn.classList.toggle("has-attachments", hasAttachments);
        this.dom.attachBtn.title = hasReachedAttachmentLimit
            ? getI18nMessage(
                "popupAttachLimitTitle",
                [String(MAX_ATTACHMENTS_PER_MESSAGE), String(MAX_ATTACHMENTS_PER_MESSAGE)],
                `Attachment limit reached (${MAX_ATTACHMENTS_PER_MESSAGE}/${MAX_ATTACHMENTS_PER_MESSAGE})`
            )
            : hasAttachments
                ? getI18nMessage(
                    "popupAttachSelectedTitle",
                    String(attachmentCount),
                    `Add files or images (${attachmentCount} selected)`
                )
                : getI18nMessage("popupAttachTitle", null, "Add files or images");
    }
}

function normalizeChatSessionsState(rawSessions, rawActiveChatId, legacyChatHistory) {
    const sessions = [];
    const seenIds = new Set();
    const now = Date.now();

    if (Array.isArray(rawSessions)) {
        for (const session of rawSessions) {
            if (!session || typeof session !== "object") {
                continue;
            }

            const sessionId = typeof session.id === "string" ? session.id.trim() : "";
            if (!sessionId || seenIds.has(sessionId)) {
                continue;
            }

            seenIds.add(sessionId);
            const normalizedHistory = normalizeStoredChatHistory(session.history);
            sessions.push({
                id: sessionId,
                title: typeof session.title === "string" ? session.title.trim().slice(0, 80) : "",
                history: normalizedHistory,
                pinned: Boolean(session.pinned),
                createdAt: Number.isFinite(session.createdAt) ? Number(session.createdAt) : now,
                updatedAt: Number.isFinite(session.updatedAt) ? Number(session.updatedAt) : now,
            });
        }
    }

    if (sessions.length === 0) {
        const legacyHistory = normalizeStoredChatHistory(legacyChatHistory);
        sessions.push({
            id: createChatSessionId(),
            title: generateChatTitleFromHistory(legacyHistory),
            history: legacyHistory,
            pinned: false,
            createdAt: now,
            updatedAt: now,
        });
    }

    const normalizedSessions = normalizeChatSessionsForUi(sessions).slice(0, MAX_CHAT_SESSIONS);
    const preferredActiveChatId = typeof rawActiveChatId === "string" ? rawActiveChatId : "";
    const hasPreferredActive = normalizedSessions.some((session) => session.id === preferredActiveChatId);
    const activeChatId = hasPreferredActive
        ? preferredActiveChatId
        : normalizedSessions[0].id;

    const changed = (
        !Array.isArray(rawSessions)
        || normalizedSessions.length !== rawSessions.length
        || preferredActiveChatId !== activeChatId
        || normalizedSessions.some((session, index) => {
            const rawSession = rawSessions[index];
            return !rawSession
                || rawSession.id !== session.id
                || rawSession.title !== session.title
                || Boolean(rawSession.pinned) !== Boolean(session.pinned)
                || rawSession.createdAt !== session.createdAt
                || rawSession.updatedAt !== session.updatedAt
                || JSON.stringify(rawSession.history) !== JSON.stringify(session.history);
        })
    );

    return {
        sessions: normalizedSessions,
        activeChatId: activeChatId,
        changed,
    };
}

function normalizeChatSessionsForUi(sessions) {
    return (Array.isArray(sessions) ? sessions.slice() : [])
        .sort((leftSession, rightSession) => {
            const leftPinnedScore = leftSession && leftSession.pinned ? 1 : 0;
            const rightPinnedScore = rightSession && rightSession.pinned ? 1 : 0;
            if (leftPinnedScore !== rightPinnedScore) {
                return rightPinnedScore - leftPinnedScore;
            }

            return Number(rightSession.updatedAt || 0) - Number(leftSession.updatedAt || 0);
        })
        .slice(0, MAX_CHAT_SESSIONS);
}

function pruneEmptyChatSessions(rawSessions, rawActiveChatId, removeActiveEmptyWhenPossible) {
    const sessions = normalizeChatSessionsForUi(rawSessions);
    if (sessions.length === 0) {
        return {
            sessions: sessions,
            activeChatId: "",
            changed: false,
        };
    }

    const activeChatId = typeof rawActiveChatId === "string" ? rawActiveChatId : "";
    const hasNonEmptySession = sessions.some((session) => !isChatSessionEmpty(session));
    const nextSessions = sessions.filter((session) => {
        if (!isChatSessionEmpty(session)) {
            return true;
        }

        if (session.id !== activeChatId) {
            return false;
        }

        return !removeActiveEmptyWhenPossible || !hasNonEmptySession;
    });

    const safeSessions = nextSessions.length > 0
        ? normalizeChatSessionsForUi(nextSessions)
        : [sessions[0]];
    const resolvedActiveChatId = safeSessions.some((session) => session.id === activeChatId)
        ? activeChatId
        : safeSessions[0].id;
    const changed = (
        resolvedActiveChatId !== activeChatId
        || safeSessions.length !== sessions.length
        || safeSessions.some((session, index) => session.id !== sessions[index].id)
    );

    return {
        sessions: safeSessions,
        activeChatId: resolvedActiveChatId,
        changed: changed,
    };
}

function isChatSessionEmpty(session) {
    if (!session || typeof session !== "object") {
        return true;
    }

    return !Array.isArray(session.history) || session.history.length === 0;
}

function normalizeStoredChatHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) {
        return [];
    }

    const normalizedHistory = [];
    for (const entry of rawHistory) {
        if (!entry || typeof entry !== "object") {
            continue;
        }

        if (!isRenderableRole(entry.role) || typeof entry.content !== "string") {
            continue;
        }

        normalizedHistory.push({ role: entry.role, content: entry.content });
    }

    return normalizedHistory;
}

function getSessionDisplayTitle(session, index) {
    const title = session && typeof session.title === "string" ? session.title.trim() : "";
    if (title.length > 0) {
        return title.slice(0, 52);
    }

    const fallbackBase = getI18nMessage("popupChatDefaultTitle", null, DEFAULT_CHAT_LABEL_FALLBACK);
    return `${fallbackBase} ${index + 1}`;
}

function generateChatTitleFromUserMessage(userMessage) {
    if (typeof userMessage !== "string") {
        return "";
    }

    const firstLine = userMessage.trim().split("\n")[0] || "";
    return firstLine.slice(0, 52);
}

function generateChatTitleFromHistory(history) {
    if (!Array.isArray(history)) {
        return "";
    }

    for (const entry of history) {
        if (entry && entry.role === "user" && typeof entry.content === "string") {
            const generatedTitle = generateChatTitleFromUserMessage(entry.content);
            if (generatedTitle) {
                return generatedTitle;
            }
        }
    }

    return "";
}

function createChatSessionId() {
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseCodeFenceSegments(text) {
    const input = typeof text === "string" ? text : String(text);
    const segments = [];
    let cursor = 0;
    let match = CODE_BLOCK_REGEX.exec(input);

    while (match) {
        if (match.index > cursor) {
            segments.push({ type: "text", value: input.slice(cursor, match.index) });
        }

        segments.push({
            type: "code",
            value: match[2] || "",
            language: normalizeCodeLanguageHint(match[1] || ""),
        });
        cursor = match.index + match[0].length;
        match = CODE_BLOCK_REGEX.exec(input);
    }

    if (cursor < input.length) {
        segments.push({ type: "text", value: input.slice(cursor) });
    }

    if (segments.length === 0) {
        segments.push({ type: "text", value: input });
    }

    CODE_BLOCK_REGEX.lastIndex = 0;
    return segments;
}

function applyCodeHighlighting(codeElement, rawCode, languageHint) {
    if (!(codeElement instanceof HTMLElement)) {
        return;
    }

    const normalizedCode = typeof rawCode === "string" ? rawCode : String(rawCode || "");
    const normalizedLanguageHint = normalizeCodeLanguageHint(languageHint);
    if (normalizedLanguageHint) {
        codeElement.classList.add(`language-${normalizedLanguageHint}`);
    }

    const highlighter = typeof globalThis === "object" && globalThis && globalThis.hljs ? globalThis.hljs : null;
    if (!highlighter) {
        codeElement.innerText = normalizedCode;
        return;
    }

    try {
        const hasExplicitLanguage = normalizedLanguageHint
            && typeof highlighter.getLanguage === "function"
            && Boolean(highlighter.getLanguage(normalizedLanguageHint));

        if (hasExplicitLanguage && typeof highlighter.highlight === "function") {
            const highlightedResult = highlighter.highlight(normalizedCode, {
                language: normalizedLanguageHint,
                ignoreIllegals: true,
            });
            codeElement.innerHTML = highlightedResult.value;
            return;
        }

        if (typeof highlighter.highlightAuto === "function") {
            const highlightedAutoResult = highlighter.highlightAuto(normalizedCode);
            codeElement.innerHTML = highlightedAutoResult.value;
            return;
        }
    } catch {
        codeElement.innerText = normalizedCode;
        return;
    }

    codeElement.innerText = normalizedCode;
}

function normalizeCodeLanguageHint(languageHint) {
    if (typeof languageHint !== "string") {
        return "";
    }

    const normalizedLanguage = languageHint.trim().toLowerCase();
    if (!/^[a-z0-9_+#.-]+$/i.test(normalizedLanguage)) {
        return "";
    }

    return normalizedLanguage;
}

function groupModelsByType(models) {
    if (!Array.isArray(models) || models.length === 0) {
        return [];
    }

    const priority = { chat: 0, image: 1 };
    const groupedByType = new Map();

    for (const model of models) {
        if (!model || typeof model !== "object") {
            continue;
        }

        const modelType = typeof model.type === "string" ? model.type : "other";
        if (!groupedByType.has(modelType)) {
            groupedByType.set(modelType, []);
        }

        groupedByType.get(modelType).push(model);
    }

    return Array.from(groupedByType.entries())
        .map(function ([type, groupedModels]) {
            return { type, models: groupedModels };
        })
        .sort(function (leftGroup, rightGroup) {
            const leftPriority = Object.prototype.hasOwnProperty.call(priority, leftGroup.type)
                ? priority[leftGroup.type]
                : Number.MAX_SAFE_INTEGER;
            const rightPriority = Object.prototype.hasOwnProperty.call(priority, rightGroup.type)
                ? priority[rightGroup.type]
                : Number.MAX_SAFE_INTEGER;
            return leftPriority - rightPriority;
        });
}

function getLocalizedModelGroupLabel(modelType) {
    if (modelType === "image") {
        return getI18nMessage("popupModelGroupImage", null, "Image models");
    }

    if (modelType === "chat") {
        return getI18nMessage("popupModelGroupChat", null, "Chat models");
    }

    return getI18nMessage("popupModelGroupOther", null, "Other models");
}

function getLocalizedModelTypeLabel(modelType) {
    if (modelType === "image") {
        return getI18nMessage("popupModelTypeImage", null, "Image");
    }

    if (modelType === "chat") {
        return getI18nMessage("popupModelTypeChat", null, "Chat");
    }

    return getI18nMessage("popupModelTypeOther", null, "Other");
}

function pickRandomItems(items, count) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const normalizedCount = Math.max(0, Math.min(Number(count) || 0, items.length));
    if (normalizedCount === 0) {
        return [];
    }

    const shuffled = items.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    return shuffled.slice(0, normalizedCount);
}

function appendPlainText(container, text, options) {
    const shouldParseInlineMarkdown = Boolean(options && options.enableLinks);
    const lines = String(text).split("\n");
    lines.forEach((line, index) => {
        if (shouldParseInlineMarkdown) {
            const headingInfo = parseMarkdownHeadingLine(line);
            if (headingInfo) {
                const headingElement = document.createElement(`h${Math.min(headingInfo.level, 6)}`);
                headingElement.className = `assistant-markdown-heading assistant-markdown-heading-level-${headingInfo.level}`;
                appendInlineMarkdown(headingElement, headingInfo.text, {
                    enableLinks: true,
                    enableBold: true,
                });
                container.appendChild(headingElement);
                return;
            }

            appendInlineMarkdown(container, line, {
                enableLinks: true,
                enableBold: true,
            });
        } else {
            container.appendChild(document.createTextNode(line));
        }

        if (index < lines.length - 1) {
            container.appendChild(document.createElement("br"));
        }
    });
}

function parseMarkdownHeadingLine(lineText) {
    const input = typeof lineText === "string" ? lineText : String(lineText);
    const match = input.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (!match) {
        return null;
    }

    return {
        level: match[1].length,
        text: match[2],
    };
}

function appendInlineMarkdown(container, lineText, options) {
    const input = typeof lineText === "string" ? lineText : String(lineText);
    const shouldParseLinks = !options || options.enableLinks !== false;
    const shouldParseBold = Boolean(options && options.enableBold);

    if (!shouldParseLinks && !shouldParseBold) {
        container.appendChild(document.createTextNode(input));
        return;
    }

    const inlinePattern = buildInlineMarkdownPattern(shouldParseLinks, shouldParseBold);
    let cursor = 0;
    let match = inlinePattern.exec(input);

    while (match) {
        if (match.index > cursor) {
            container.appendChild(document.createTextNode(input.slice(cursor, match.index)));
        }

        if (typeof match.groups === "object" && typeof match.groups.markdownUrl === "string") {
            const markdownLabel = typeof match.groups.markdownLabel === "string"
                ? match.groups.markdownLabel.trim()
                : "";
            const markdownUrl = match.groups.markdownUrl.trim();
            const normalizedMarkdownUrl = normalizeDetectedLinkUrl(markdownUrl);

            if (normalizedMarkdownUrl) {
                container.appendChild(createAssistantLinkElement(normalizedMarkdownUrl, markdownLabel || normalizedMarkdownUrl));
            } else {
                container.appendChild(document.createTextNode(match[0]));
            }

            cursor = match.index + match[0].length;
            match = inlinePattern.exec(input);
            continue;
        }

        if (typeof match.groups === "object" && typeof match.groups.plainUrl === "string") {
            const rawUrl = match.groups.plainUrl;
            const normalizedUrlResult = normalizeDetectedPlainUrl(rawUrl);

            if (normalizedUrlResult.url) {
                container.appendChild(createAssistantLinkElement(normalizedUrlResult.url, normalizedUrlResult.url));
                if (normalizedUrlResult.trailingText) {
                    container.appendChild(document.createTextNode(normalizedUrlResult.trailingText));
                }
            } else {
                container.appendChild(document.createTextNode(rawUrl));
            }

            cursor = match.index + match[0].length;
            match = inlinePattern.exec(input);
            continue;
        }

        if (typeof match.groups === "object" && typeof match.groups.boldText === "string") {
            const boldElement = document.createElement("strong");
            appendInlineMarkdown(boldElement, match.groups.boldText, {
                enableLinks: shouldParseLinks,
                enableBold: false,
            });
            container.appendChild(boldElement);

            cursor = match.index + match[0].length;
            match = inlinePattern.exec(input);
            continue;
        }

        container.appendChild(document.createTextNode(match[0]));
        cursor = match.index + match[0].length;
        match = inlinePattern.exec(input);
    }

    if (cursor < input.length) {
        container.appendChild(document.createTextNode(input.slice(cursor)));
    }
}

function buildInlineMarkdownPattern(enableLinks, enableBold) {
    const patternParts = [];

    if (enableLinks) {
        patternParts.push("\\[(?<markdownLabel>[^\\]]+)\\]\\((?<markdownUrl>https?:\\/\\/[^\\s)]+)\\)");
        patternParts.push("(?<plainUrl>https?:\\/\\/[^\\s<>\"']+)");
    }

    if (enableBold) {
        patternParts.push("\\*\\*(?<boldText>[\\s\\S]+?)\\*\\*");
    }

    return new RegExp(patternParts.join("|"), "gi");
}

function createAssistantLinkElement(url, label) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.className = "assistant-link";
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = label;
    return anchor;
}

function normalizeDetectedPlainUrl(rawUrl) {
    if (typeof rawUrl !== "string") {
        return { url: "", trailingText: "" };
    }

    let endIndex = rawUrl.length;
    while (endIndex > 0 && /[.,!?;:]/.test(rawUrl[endIndex - 1])) {
        endIndex -= 1;
    }

    while (endIndex > 0) {
        const trailingChar = rawUrl[endIndex - 1];
        if (trailingChar !== ")" && trailingChar !== "]") {
            break;
        }

        const openingChar = trailingChar === ")" ? "(" : "[";
        const candidate = rawUrl.slice(0, endIndex);
        const openingCount = countChar(candidate, openingChar);
        const closingCount = countChar(candidate, trailingChar);

        if (closingCount > openingCount) {
            endIndex -= 1;
            continue;
        }

        break;
    }

    const url = normalizeDetectedLinkUrl(rawUrl.slice(0, endIndex));
    const trailingText = rawUrl.slice(endIndex);
    return { url, trailingText };
}

function normalizeDetectedLinkUrl(rawUrl) {
    if (typeof rawUrl !== "string") {
        return "";
    }

    const normalizedUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
        return "";
    }

    return normalizedUrl;
}

function countChar(text, character) {
    let count = 0;
    for (const currentChar of text) {
        if (currentChar === character) {
            count += 1;
        }
    }

    return count;
}

function isStreamPayload(streamPayload) {
    if (!streamPayload || typeof streamPayload !== "object") {
        return false;
    }

    return streamPayload.type === "start"
        || streamPayload.type === "delta"
        || streamPayload.type === "done";
}

function isFileDragEvent(event) {
    if (!event || !event.dataTransfer || !event.dataTransfer.types) {
        return false;
    }

    return Array.from(event.dataTransfer.types).includes("Files");
}

function isImageContent(content) {
    if (typeof content !== "string") {
        return false;
    }

    return content.startsWith("data:image/")
        || content.startsWith("https://oaidalleapiprodscus.blob.core.windows.net/");
}

function isRenderableRole(role) {
    return role === "user" || role === "assistant";
}

function setElementText(element, text) {
    if (!(element instanceof HTMLElement)) {
        return;
    }

    element.innerText = typeof text === "string" ? text : String(text ?? "");
}

function getStorageData(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            resolve(result || {});
        });
    });
}

function setStorageData(data) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(data, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            resolve();
        });
    });
}

function getSafeErrorMessage(error) {
    if (error && typeof error.message === "string" && error.message.trim().length > 0) {
        return error.message;
    }

    return getI18nMessage("popupErrorGeneric", null, "Something went wrong. Please try again.");
}

function getContrastingTextColor(hexColor) {
    const normalizedColor = getValidAccentColor(hexColor).slice(1);
    const red = parseInt(normalizedColor.slice(0, 2), 16);
    const green = parseInt(normalizedColor.slice(2, 4), 16);
    const blue = parseInt(normalizedColor.slice(4, 6), 16);
    const perceivedLuminance = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
    return perceivedLuminance >= 160 ? "#111111" : "#ffffff";
}

function isTextareaMultiline(textareaElement) {
    if (!(textareaElement instanceof HTMLTextAreaElement)) {
        return false;
    }

    const style = window.getComputedStyle(textareaElement);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const singleLineHeight = lineHeight + paddingTop + paddingBottom;
    return textareaElement.scrollHeight > singleLineHeight + 1;
}

function isElementMultiline(element) {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    const style = window.getComputedStyle(element);
    const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 14) * 1.3;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const contentHeight = element.scrollHeight - paddingTop - paddingBottom;
    if (contentHeight <= 0 || lineHeight <= 0) {
        return false;
    }

    return (contentHeight / lineHeight) > 1.2;
}

function isUserMessagePreviewContent(content) {
    return Boolean(
        content
        && typeof content === "object"
        && content.type === "user_message_preview"
    );
}

function resolveUserPreviewContent(content) {
    if (isUserMessagePreviewContent(content)) {
        return content;
    }

    return parseStoredUserMessagePreview(content);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string" || reader.result.length === 0) {
                reject(new Error(getI18nMessage("popupErrorReadFileFailed", null, "Failed to read file.")));
                return;
            }

            resolve(reader.result);
        };
        reader.onerror = () => {
            reject(new Error(getI18nMessage("popupErrorReadFileFailed", null, "Failed to read file.")));
        };
        reader.readAsDataURL(file);
    });
}

function sanitizeAttachmentFileName(fileName) {
    if (typeof fileName !== "string") {
        return getI18nMessage("popupAttachmentFallbackName", null, "attachment");
    }

    const normalizedName = fileName.trim().slice(0, 120);
    return normalizedName || getI18nMessage("popupAttachmentFallbackName", null, "attachment");
}

function cloneAttachmentForRuntime(attachment) {
    return {
        fileName: sanitizeAttachmentFileName(attachment.fileName),
        mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : "",
        dataUrl: typeof attachment.dataUrl === "string" ? attachment.dataUrl : "",
        isImage: Boolean(attachment.isImage),
    };
}

function buildUserMessagePreview(userMessage, attachments) {
    return {
        type: "user_message_preview",
        text: typeof userMessage === "string" ? userMessage : "",
        attachments: Array.isArray(attachments) ? attachments.map(cloneAttachmentForRuntime) : [],
    };
}

function parseStoredUserMessagePreview(content) {
    if (typeof content !== "string" || content.length === 0) {
        return null;
    }

    const lines = content.split("\n");
    let summaryLineIndex = -1;
    const attachmentPrefixPattern = buildAttachmentPrefixPattern();
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (attachmentPrefixPattern.test(lines[index])) {
            summaryLineIndex = index;
            break;
        }
    }

    if (summaryLineIndex === -1) {
        return null;
    }

    const summaryLine = lines[summaryLineIndex].replace(attachmentPrefixPattern, "").trim();
    if (summaryLine.length === 0) {
        return null;
    }

    const attachmentItems = summaryLine.split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .map((item) => createStoredAttachmentSummaryItem(item));

    if (attachmentItems.length === 0) {
        return null;
    }

    const textLines = lines.slice(0, summaryLineIndex);
    while (textLines.length > 0 && textLines[textLines.length - 1].trim().length === 0) {
        textLines.pop();
    }

    return {
        type: "user_message_preview",
        text: textLines.join("\n"),
        attachments: attachmentItems,
    };
}

function createStoredAttachmentSummaryItem(rawItem) {
    const normalizedItem = sanitizeAttachmentFileName(rawItem);
    const lowerItem = normalizedItem.toLowerCase();
    const imageToken = getI18nMessage("popupAttachmentImageToken", null, "image").toLowerCase();

    if (lowerItem === "image" || lowerItem === imageToken) {
        return {
            fileName: normalizedItem,
            summaryLabel: getI18nMessage("popupAttachmentImageLabel", null, "Image"),
        };
    }

    const extensionMatch = normalizedItem.match(/\.([a-z0-9]{1,8})$/i);
    const extensionLabel = extensionMatch
        ? extensionMatch[1].toUpperCase()
        : getI18nMessage("popupAttachmentFileLabel", null, "FILE");

    return {
        fileName: normalizedItem,
        summaryLabel: extensionLabel,
    };
}

function buildAttachmentPrefixPattern() {
    const localizedPrefix = getI18nMessage("popupAttachmentSummaryPrefix", null, "Attachments");
    const prefixes = [localizedPrefix, "Attachments", "Attachment"]
        .filter((prefix, index, source) => prefix && source.indexOf(prefix) === index)
        .map((prefix) => escapeRegex(prefix));

    return new RegExp(`^\\s*(?:${prefixes.join("|")}):\\s*`, "i");
}

function escapeRegex(input) {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
