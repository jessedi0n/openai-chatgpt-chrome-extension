(function initializeOpenAIModelsConfig(globalScope) {
    const STORAGE_KEYS = Object.freeze({
        MODEL: "apiModel",
        THINKING: "apiThinkingLevel",
        WEB_SEARCH: "webSearchEnabled",
        SYSTEM_MESSAGE: "customSystemMessage",
        ACCENT_COLOR: "accentColor",
        LANGUAGE: "languagePreference",
    });

    const MODELS = Object.freeze([
        {
            id: "gpt-5.2",
            label: "GPT-5.2",
            type: "chat",
            supportsThinking: true,
            supportsWebSearch: true,
            thinking: Object.freeze({
                defaultEffort: "none",
                supportedEfforts: Object.freeze(["none", "low", "medium", "high", "xhigh"]),
            }),
        },
        {
            id: "gpt-5.1",
            label: "GPT-5.1",
            type: "chat",
            supportsThinking: true,
            supportsWebSearch: true,
            thinking: Object.freeze({
                defaultEffort: "none",
                supportedEfforts: Object.freeze(["none", "low", "medium", "high"]),
            }),
        },
        {
            id: "gpt-5-pro",
            label: "GPT-5 pro",
            type: "chat",
            supportsThinking: true,
            supportsWebSearch: true,
            thinking: Object.freeze({
                defaultEffort: "high",
                supportedEfforts: Object.freeze(["high"]),
            }),
        },
        {
            id: "gpt-5-mini",
            label: "GPT-5 mini",
            type: "chat",
            supportsThinking: true,
            supportsWebSearch: true,
            thinking: Object.freeze({
                defaultEffort: "medium",
                supportedEfforts: Object.freeze(["minimal", "low", "medium", "high"]),
            }),
        },
        {
            id: "gpt-5-nano",
            label: "GPT-5 nano",
            type: "chat",
            supportsThinking: true,
            supportsWebSearch: true,
            thinking: Object.freeze({
                defaultEffort: "medium",
                supportedEfforts: Object.freeze(["minimal", "low", "medium", "high"]),
            }),
        },
        {
            id: "gpt-image-1.5",
            label: "GPT Image 1.5",
            type: "image",
            supportsThinking: false,
            supportsWebSearch: false,
        },
        {
            id: "gpt-image-1-mini",
            label: "GPT Image 1 mini",
            type: "image",
            supportsThinking: false,
            supportsWebSearch: false,
        },
    ]);

    const THINKING_LEVELS = Object.freeze([
        {
            id: "default",
            label: "Default",
            i18nKey: "thinkingLevelDefault",
        },
        {
            id: "none",
            label: "None",
            i18nKey: "thinkingLevelNone",
        },
        {
            id: "minimal",
            label: "Minimal",
            i18nKey: "thinkingLevelMinimal",
        },
        {
            id: "low",
            label: "Low",
            i18nKey: "thinkingLevelLow",
        },
        {
            id: "medium",
            label: "Medium",
            i18nKey: "thinkingLevelMedium",
        },
        {
            id: "high",
            label: "High",
            i18nKey: "thinkingLevelHigh",
        },
        {
            id: "xhigh",
            label: "XHigh",
            i18nKey: "thinkingLevelXHigh",
        },
    ]);

    const DEFAULT_MODEL_ID = "gpt-5.2";
    const DEFAULT_THINKING_LEVEL = "default";
    const DEFAULT_WEB_SEARCH_ENABLED = false;
    const DEFAULT_ACCENT_COLOR = "#4f8cff";
    const DEFAULT_LANGUAGE_PREFERENCE = "auto";
    const SUPPORTED_LANGUAGE_PREFERENCES = Object.freeze(["auto", "en", "de"]);
    const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{6})$/;
    const MODELS_BY_ID = new Map(MODELS.map((model) => [model.id, model]));
    const THINKING_LEVELS_BY_ID = new Map(THINKING_LEVELS.map((level) => [level.id, level]));
    let localizedMessagesByKey = null;
    let activeLanguagePreference = DEFAULT_LANGUAGE_PREFERENCE;
    let activeResolvedLanguage = "en";

    function getModelById(modelId) {
        return MODELS_BY_ID.get(modelId) || null;
    }

    function getThinkingLevelById(thinkingLevel) {
        return THINKING_LEVELS_BY_ID.get(thinkingLevel) || null;
    }

    function getValidModelId(modelId) {
        return MODELS_BY_ID.has(modelId) ? modelId : DEFAULT_MODEL_ID;
    }

    function getThinkingLevelsForModel(modelId) {
        const model = getModelById(modelId);
        if (!model || model.supportsThinking !== true) {
            return [];
        }

        const modelThinking = model.thinking || {};
        const supportedEfforts = Array.isArray(modelThinking.supportedEfforts)
            ? modelThinking.supportedEfforts
            : [];

        const levelIds = [DEFAULT_THINKING_LEVEL].concat(
            supportedEfforts.filter((effort) => THINKING_LEVELS_BY_ID.has(effort))
        );

        const uniqueLevelIds = Array.from(new Set(levelIds));
        return uniqueLevelIds
            .map((levelId) => getThinkingLevelById(levelId))
            .filter(Boolean);
    }

    function getValidThinkingLevel(thinkingLevel, modelId) {
        const normalizedThinkingLevel = THINKING_LEVELS_BY_ID.has(thinkingLevel)
            ? thinkingLevel
            : DEFAULT_THINKING_LEVEL;

        if (normalizedThinkingLevel === DEFAULT_THINKING_LEVEL) {
            return DEFAULT_THINKING_LEVEL;
        }

        const allowedLevelIds = new Set(
            getThinkingLevelsForModel(modelId).map((level) => level.id)
        );

        return allowedLevelIds.has(normalizedThinkingLevel)
            ? normalizedThinkingLevel
            : DEFAULT_THINKING_LEVEL;
    }

    function getThinkingLabel(thinkingLevel, modelId) {
        const validThinkingLevel = getValidThinkingLevel(thinkingLevel, modelId);
        const level = getThinkingLevelById(validThinkingLevel) || getThinkingLevelById(DEFAULT_THINKING_LEVEL);
        if (!level) {
            return getI18nMessage("thinkingLevelDefault", null, "Default");
        }

        if (level.id !== DEFAULT_THINKING_LEVEL) {
            return getThinkingLevelLocalizedLabel(level);
        }

        const model = getModelById(modelId);
        const defaultEffort = model
            && model.thinking
            && typeof model.thinking.defaultEffort === "string"
            ? model.thinking.defaultEffort
            : null;

        if (!defaultEffort) {
            return level.label;
        }

        const defaultEffortLevel = getThinkingLevelById(defaultEffort);
        if (!defaultEffortLevel) {
            return getThinkingLevelLocalizedLabel(level);
        }

        const localizedLevelLabel = getThinkingLevelLocalizedLabel(defaultEffortLevel);
        return getI18nMessage(
            "thinkingLevelDefaultWithValue",
            localizedLevelLabel,
            `Default (${localizedLevelLabel})`
        );
    }

    function getThinkingEffort(thinkingLevel, modelId) {
        const validThinkingLevel = getValidThinkingLevel(thinkingLevel, modelId);
        if (validThinkingLevel === DEFAULT_THINKING_LEVEL) {
            return null;
        }

        return validThinkingLevel;
    }

    function getDefaultThinkingEffort(modelId) {
        const model = getModelById(modelId);
        const defaultEffort = model
            && model.thinking
            && typeof model.thinking.defaultEffort === "string"
            ? model.thinking.defaultEffort
            : null;

        return THINKING_LEVELS_BY_ID.has(defaultEffort) ? defaultEffort : null;
    }

    function supportsThinkingEffort(modelId, effort) {
        if (typeof effort !== "string" || effort.length === 0) {
            return false;
        }

        const allowedLevelIds = new Set(
            getThinkingLevelsForModel(modelId).map((level) => level.id)
        );

        return allowedLevelIds.has(effort);
    }

    function getThinkingLevelOptions(modelId) {
        return getThinkingLevelsForModel(modelId).map(function (level) {
            return Object.freeze({
                id: level.id,
                label: getThinkingLabel(level.id, modelId),
            });
        });
    }

    function supportsThinking(modelId) {
        const model = getModelById(modelId);
        return Boolean(model && model.supportsThinking === true && getThinkingLevelsForModel(modelId).length > 0);
    }

    function supportsWebSearch(modelId) {
        const model = getModelById(modelId);
        return Boolean(model && model.supportsWebSearch === true);
    }

    function isImageModel(modelId) {
        const model = getModelById(modelId);
        return Boolean(model && model.type === "image");
    }

    function getValidAccentColor(accentColor) {
        if (typeof accentColor !== "string") {
            return DEFAULT_ACCENT_COLOR;
        }

        const normalizedColor = accentColor.trim();
        if (!HEX_COLOR_REGEX.test(normalizedColor)) {
            return DEFAULT_ACCENT_COLOR;
        }

        return normalizedColor.toLowerCase();
    }

    function getValidWebSearchEnabled(webSearchEnabled) {
        return webSearchEnabled === true;
    }

    function getValidLanguagePreference(languagePreference) {
        if (typeof languagePreference !== "string") {
            return DEFAULT_LANGUAGE_PREFERENCE;
        }

        const normalizedPreference = languagePreference.trim().toLowerCase();
        return SUPPORTED_LANGUAGE_PREFERENCES.includes(normalizedPreference)
            ? normalizedPreference
            : DEFAULT_LANGUAGE_PREFERENCE;
    }

    function resolveLanguagePreference(languagePreference) {
        const normalizedPreference = getValidLanguagePreference(languagePreference);
        if (normalizedPreference !== DEFAULT_LANGUAGE_PREFERENCE) {
            return normalizedPreference;
        }

        const chromeUiLanguage = typeof chrome === "object"
            && chrome
            && chrome.i18n
            && typeof chrome.i18n.getUILanguage === "function"
            ? chrome.i18n.getUILanguage()
            : "";
        const navigatorLanguage = typeof navigator === "object"
            && navigator
            && typeof navigator.language === "string"
            ? navigator.language
            : "";
        const uiLanguage = String(chromeUiLanguage || navigatorLanguage).trim().toLowerCase();
        return uiLanguage.startsWith("de") ? "de" : "en";
    }

    async function setLanguagePreference(languagePreference) {
        const normalizedPreference = getValidLanguagePreference(languagePreference);
        const resolvedLanguage = resolveLanguagePreference(normalizedPreference);

        if (
            localizedMessagesByKey
            && normalizedPreference === activeLanguagePreference
            && resolvedLanguage === activeResolvedLanguage
        ) {
            return Object.freeze({
                preference: activeLanguagePreference,
                language: activeResolvedLanguage,
            });
        }

        localizedMessagesByKey = null;

        try {
            const messagesUrl = typeof chrome === "object"
                && chrome
                && chrome.runtime
                && typeof chrome.runtime.getURL === "function"
                ? chrome.runtime.getURL(`_locales/${resolvedLanguage}/messages.json`)
                : `_locales/${resolvedLanguage}/messages.json`;
            const response = await fetch(messagesUrl);
            if (!response.ok) {
                throw new Error(`Failed to load locale messages: ${response.status}`);
            }

            const localeData = await response.json();
            if (localeData && typeof localeData === "object") {
                localizedMessagesByKey = localeData;
            }
        } catch {
            localizedMessagesByKey = null;
        }

        activeLanguagePreference = normalizedPreference;
        activeResolvedLanguage = resolvedLanguage;

        return Object.freeze({
            preference: activeLanguagePreference,
            language: activeResolvedLanguage,
        });
    }

    function getLanguagePreference() {
        return activeLanguagePreference;
    }

    function getResolvedLanguage() {
        return activeResolvedLanguage;
    }

    function getThinkingLevelLocalizedLabel(level) {
        if (!level || typeof level !== "object") {
            return "";
        }

        const i18nKey = typeof level.i18nKey === "string" ? level.i18nKey : "";
        if (!i18nKey) {
            return level.label;
        }

        return getI18nMessage(i18nKey, null, level.label);
    }

    function getI18nMessage(key, substitutions, fallback) {
        const localizedMessage = getLoadedLocalizedMessage(key, substitutions);
        if (typeof localizedMessage === "string" && localizedMessage.length > 0) {
            return localizedMessage;
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

    function getLoadedLocalizedMessage(key, substitutions) {
        if (!localizedMessagesByKey || typeof key !== "string" || key.length === 0) {
            return "";
        }

        const entry = localizedMessagesByKey[key];
        const template = entry && typeof entry.message === "string" ? entry.message : "";
        if (!template) {
            return "";
        }

        return applySubstitutions(template, substitutions);
    }

    function applySubstitutions(template, substitutions) {
        const normalizedTemplate = String(template).replace(/\$\$/g, "$");
        if (typeof substitutions === "undefined" || substitutions === null) {
            return normalizedTemplate;
        }

        const normalizedSubstitutions = Array.isArray(substitutions)
            ? substitutions
            : [substitutions];

        return normalizedTemplate.replace(/\$(\d)/g, function (match, group) {
            const index = Number(group) - 1;
            if (index < 0 || index >= normalizedSubstitutions.length) {
                return match;
            }

            const substitution = normalizedSubstitutions[index];
            return substitution === null || typeof substitution === "undefined"
                ? ""
                : String(substitution);
        });
    }

    globalScope.OPENAI_MODELS = Object.freeze({
        STORAGE_KEYS,
        MODELS,
        THINKING_LEVELS,
        DEFAULT_MODEL_ID,
        DEFAULT_THINKING_LEVEL,
        DEFAULT_WEB_SEARCH_ENABLED,
        DEFAULT_ACCENT_COLOR,
        DEFAULT_LANGUAGE_PREFERENCE,
        SUPPORTED_LANGUAGE_PREFERENCES,
        getModelById,
        getThinkingLevelById,
        getValidModelId,
        getThinkingLevelsForModel,
        getThinkingLevelOptions,
        getValidThinkingLevel,
        getValidAccentColor,
        getValidWebSearchEnabled,
        getValidLanguagePreference,
        resolveLanguagePreference,
        setLanguagePreference,
        getLanguagePreference,
        getResolvedLanguage,
        getI18nMessage,
        getThinkingLabel,
        getThinkingEffort,
        getDefaultThinkingEffort,
        supportsThinkingEffort,
        isImageModel,
        supportsThinking,
        supportsWebSearch,
    });
})(typeof globalThis !== "undefined" ? globalThis : self);
