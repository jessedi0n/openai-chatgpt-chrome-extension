const FALLBACK_STORAGE_KEYS = Object.freeze({
    SYSTEM_MESSAGE: "customSystemMessage",
    ACCENT_COLOR: "accentColor",
    LANGUAGE: "languagePreference",
});

const STORAGE_KEYS = (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && OPENAI_MODELS.STORAGE_KEYS)
    ? OPENAI_MODELS.STORAGE_KEYS
    : FALLBACK_STORAGE_KEYS;
const DEFAULT_ACCENT_COLOR = (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && typeof OPENAI_MODELS.DEFAULT_ACCENT_COLOR === "string")
    ? OPENAI_MODELS.DEFAULT_ACCENT_COLOR
    : "#4f8cff";
const DEFAULT_LANGUAGE_PREFERENCE = (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && typeof OPENAI_MODELS.DEFAULT_LANGUAGE_PREFERENCE === "string")
    ? OPENAI_MODELS.DEFAULT_LANGUAGE_PREFERENCE
    : "auto";
const SUPPORTED_LANGUAGE_PREFERENCES = (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && Array.isArray(OPENAI_MODELS.SUPPORTED_LANGUAGE_PREFERENCES))
    ? OPENAI_MODELS.SUPPORTED_LANGUAGE_PREFERENCES
    : ["auto", "en", "de"];
const getValidAccentColor = (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && typeof OPENAI_MODELS.getValidAccentColor === "function")
    ? OPENAI_MODELS.getValidAccentColor
    : fallbackAccentColor;
const getValidLanguagePreference = (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && typeof OPENAI_MODELS.getValidLanguagePreference === "function")
    ? OPENAI_MODELS.getValidLanguagePreference
    : fallbackLanguagePreference;
const setLanguagePreference = (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && typeof OPENAI_MODELS.setLanguagePreference === "function")
    ? OPENAI_MODELS.setLanguagePreference
    : fallbackSetLanguagePreference;
const getResolvedLanguage = (typeof OPENAI_MODELS === "object" && OPENAI_MODELS && typeof OPENAI_MODELS.getResolvedLanguage === "function")
    ? OPENAI_MODELS.getResolvedLanguage
    : fallbackResolvedLanguage;

document.addEventListener("DOMContentLoaded", function () {
    const apiKeyInput = document.getElementById("apiKey");
    const apiKeyVisibilityToggleButton = document.getElementById("toggle-api-key-visibility");
    const saveButton = document.getElementById("save-button");
    const deleteButton = document.getElementById("delete-button");
    const statusMessage = document.getElementById("status-message");
    const systemMessageInput = document.getElementById("systemMessage");
    const saveSystemMessageButton = document.getElementById("save-system-message-button");
    const resetSystemMessageButton = document.getElementById("reset-system-message-button");
    const accentColorInput = document.getElementById("accentColor");
    const accentColorHexInput = document.getElementById("accent-color-hex");
    const saveAccentColorButton = document.getElementById("save-accent-color-button");
    const resetAccentColorButton = document.getElementById("reset-accent-color-button");
    const languageSelect = document.getElementById("language-select");
    const saveLanguageButton = document.getElementById("save-language-button");
    const resetLanguageButton = document.getElementById("reset-language-button");
    let isApiKeyVisible = false;

    applyAccentColor(getValidAccentColor(DEFAULT_ACCENT_COLOR));
    setApiKeyVisibility(false);
    renderLanguageOptions();

    void initializePage();

    saveButton.addEventListener("click", function () {
        const apiKey = apiKeyInput.value.trim();
        const looksLikeApiKey = apiKey.startsWith("sk-") && apiKey.length >= 20;

        if (!looksLikeApiKey) {
            showStatus(getI18nMessage("optionsStatusInvalidApiKey", null, "Please enter a valid API key."));
            return;
        }

        chrome.storage.local.set({ apiKey: apiKey }, function () {
            showStatus(getI18nMessage("optionsStatusApiKeySaved", null, "API key saved successfully!"));
        });
    });

    deleteButton.addEventListener("click", function () {
        chrome.storage.local.remove(["apiKey"], function () {
            apiKeyInput.value = "";
            showStatus(getI18nMessage("optionsStatusApiKeyDeleted", null, "API key deleted successfully!"));
        });
    });

    apiKeyVisibilityToggleButton.addEventListener("click", function () {
        setApiKeyVisibility(!isApiKeyVisible);
    });

    saveSystemMessageButton.addEventListener("click", function () {
        const systemMessage = normalizeSystemMessage(systemMessageInput.value);
        chrome.storage.local.set({ [STORAGE_KEYS.SYSTEM_MESSAGE]: systemMessage }, function () {
            systemMessageInput.value = systemMessage;
            showStatus(getI18nMessage("optionsStatusSystemMessageSaved", null, "Custom system message saved."));
        });
    });

    resetSystemMessageButton.addEventListener("click", function () {
        chrome.storage.local.set({ [STORAGE_KEYS.SYSTEM_MESSAGE]: "" }, function () {
            systemMessageInput.value = "";
            showStatus(getI18nMessage("optionsStatusSystemMessageReset", null, "Custom system message reset to default."));
        });
    });

    accentColorInput.addEventListener("input", function () {
        applyAccentColor(accentColorInput.value);
    });

    accentColorHexInput.addEventListener("input", function () {
        const normalizedFromInput = normalizeAccentColorInputValue(accentColorHexInput.value);
        if (!normalizedFromInput) {
            return;
        }

        applyAccentColor(normalizedFromInput);
    });

    accentColorHexInput.addEventListener("blur", function () {
        const normalizedFromInput = normalizeAccentColorInputValue(accentColorHexInput.value);
        applyAccentColor(getValidAccentColor(normalizedFromInput || accentColorInput.value));
    });

    saveAccentColorButton.addEventListener("click", function () {
        const preferredInputColor = normalizeAccentColorInputValue(accentColorHexInput.value);
        const accentColor = getValidAccentColor(preferredInputColor || accentColorInput.value);
        chrome.storage.local.set({ [STORAGE_KEYS.ACCENT_COLOR]: accentColor }, function () {
            applyAccentColor(accentColor);
            showStatus(getI18nMessage("optionsStatusAccentSaved", null, "Accent color saved."));
        });
    });

    resetAccentColorButton.addEventListener("click", function () {
        chrome.storage.local.set({ [STORAGE_KEYS.ACCENT_COLOR]: DEFAULT_ACCENT_COLOR }, function () {
            applyAccentColor(DEFAULT_ACCENT_COLOR);
            showStatus(getI18nMessage("optionsStatusAccentReset", null, "Accent color reset to default."));
        });
    });

    saveLanguageButton.addEventListener("click", function () {
        const selectedLanguage = getValidLanguagePreference(languageSelect.value);
        chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: selectedLanguage }, function () {
            void setLanguagePreference(selectedLanguage).finally(function () {
                applyLocalization();
                showStatus(getI18nMessage("optionsStatusLanguageSaved", null, "Language saved."));
            });
        });
    });

    resetLanguageButton.addEventListener("click", function () {
        chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: DEFAULT_LANGUAGE_PREFERENCE }, function () {
            languageSelect.value = DEFAULT_LANGUAGE_PREFERENCE;
            void setLanguagePreference(DEFAULT_LANGUAGE_PREFERENCE).finally(function () {
                applyLocalization();
                showStatus(getI18nMessage("optionsStatusLanguageReset", null, "Language reset to automatic."));
            });
        });
    });

    async function initializePage() {
        await initializeLanguagePreference();
        applyLocalization();
        await loadSavedValues();
        applyLocalization();
    }

    function initializeLanguagePreference() {
        return new Promise(function (resolve) {
            chrome.storage.local.get([STORAGE_KEYS.LANGUAGE], function (result) {
                const normalizedLanguagePreference = getValidLanguagePreference(result[STORAGE_KEYS.LANGUAGE]);
                languageSelect.value = normalizedLanguagePreference;

                const finish = function () {
                    void setLanguagePreference(normalizedLanguagePreference).finally(function () {
                        resolve();
                    });
                };

                if (normalizedLanguagePreference !== result[STORAGE_KEYS.LANGUAGE]) {
                    chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: normalizedLanguagePreference }, finish);
                    return;
                }

                finish();
            });
        });
    }

    function loadSavedValues() {
        return new Promise(function (resolve) {
            chrome.storage.local.get(
                ["apiKey", STORAGE_KEYS.SYSTEM_MESSAGE, STORAGE_KEYS.ACCENT_COLOR, STORAGE_KEYS.LANGUAGE],
                function (result) {
                    if (typeof result.apiKey === "string") {
                        apiKeyInput.value = result.apiKey;
                    }

                    if (typeof result[STORAGE_KEYS.SYSTEM_MESSAGE] === "string") {
                        systemMessageInput.value = result[STORAGE_KEYS.SYSTEM_MESSAGE];
                    }

                    const normalizedLanguagePreference = getValidLanguagePreference(result[STORAGE_KEYS.LANGUAGE]);
                    languageSelect.value = normalizedLanguagePreference;
                    applyAccentColor(getValidAccentColor(result[STORAGE_KEYS.ACCENT_COLOR]));

                    resolve();
                }
            );
        });
    }

    function renderLanguageOptions() {
        languageSelect.innerHTML = "";
        for (const languagePreference of SUPPORTED_LANGUAGE_PREFERENCES) {
            const optionElement = document.createElement("option");
            optionElement.value = languagePreference;
            optionElement.innerText = getLanguageOptionLabel(languagePreference);
            languageSelect.appendChild(optionElement);
        }

        languageSelect.value = getValidLanguagePreference(languageSelect.value || DEFAULT_LANGUAGE_PREFERENCE);
    }

    function getLanguageOptionLabel(languagePreference) {
        if (languagePreference === "de") {
            return getI18nMessage("optionsLanguageGermanOption", null, "Deutsch");
        }

        if (languagePreference === "en") {
            return getI18nMessage("optionsLanguageEnglishOption", null, "English");
        }

        return getI18nMessage("optionsLanguageAutoOption", null, "Automatic (browser language)");
    }

    function applyAccentColor(accentColor) {
        const normalizedColor = getValidAccentColor(accentColor);
        accentColorInput.value = normalizedColor;
        accentColorHexInput.value = normalizedColor;
    }

    function setApiKeyVisibility(visible) {
        isApiKeyVisible = visible === true;
        apiKeyInput.type = isApiKeyVisible ? "text" : "password";
        updateApiKeyVisibilityToggle();
    }

    function updateApiKeyVisibilityToggle() {
        const icon = apiKeyVisibilityToggleButton.querySelector("i");
        if (icon) {
            icon.className = isApiKeyVisible ? "fa fa-eye-slash" : "fa fa-eye";
        }

        const title = isApiKeyVisible
            ? getI18nMessage("optionsApiKeyHideTitle", null, "Hide API key")
            : getI18nMessage("optionsApiKeyShowTitle", null, "Show API key");
        apiKeyVisibilityToggleButton.title = title;
        apiKeyVisibilityToggleButton.setAttribute("aria-label", title);
    }

    function applyLocalization() {
        document.documentElement.lang = getResolvedLanguage();
        document.title = getI18nMessage("optionsTitle", null, "Settings");
        document.getElementById("optionsTitle").innerText = getI18nMessage("optionsTitle", null, "Settings");
        document.getElementById("apiTitle").innerText = getI18nMessage("apiTitle", null, "Enter your OpenAI API key below to get started.");
        document.getElementById("apiKey").placeholder = getI18nMessage("optionsInputPlaceholder", null, "Enter your API key here");
        document.getElementById("api-key-note").innerText = getI18nMessage("optionsApiKeyNote", null, "Note: Your API key is only stored locally on your computer.");
        document.getElementById("save-button-text").innerText = getI18nMessage("optionsSaveButtonText", null, "Save");
        document.getElementById("delete-button-text").innerText = getI18nMessage("optionsDeleteButtonText", null, "Delete API key");
        document.getElementById("save-button").title = getI18nMessage("optionsSaveApiKeyTitle", null, "Save API key");
        document.getElementById("delete-button").title = getI18nMessage("optionsDeleteApiKeyTitle", null, "Delete API key");
        updateApiKeyVisibilityToggle();

        document.getElementById("system-message-title").innerText = getI18nMessage("optionsSystemMessageTitle", null, "Custom system message");
        document.getElementById("systemMessage").placeholder = getI18nMessage("optionsSystemMessagePlaceholder", null, "Optional: Add a system message to control assistant behavior.");
        document.getElementById("system-message-note").innerText = getI18nMessage("optionsSystemMessageNote", null, "This message is prepended as a system instruction for each new request. Leave empty to use default behavior.");
        document.getElementById("save-system-message-button-text").innerText = getI18nMessage("optionsSystemMessageSaveButtonText", null, "Save system message");
        document.getElementById("reset-system-message-button-text").innerText = getI18nMessage("optionsResetButtonText", null, "Reset");
        document.getElementById("save-system-message-button").title = getI18nMessage("optionsSaveSystemMessageTitle", null, "Save custom system message");
        document.getElementById("reset-system-message-button").title = getI18nMessage("optionsResetSystemMessageTitle", null, "Reset custom system message");

        document.getElementById("accent-color-title").innerText = getI18nMessage("optionsAccentColorTitle", null, "Accent color");
        document.getElementById("accent-color-note").innerText = getI18nMessage("optionsAccentColorNote", null, "Used for user message bubbles in the popup.");
        document.getElementById("accent-color-hex").placeholder = getI18nMessage("optionsAccentColorHexPlaceholder", null, "Paste hex (e.g. #4f8cff)");
        document.getElementById("save-accent-color-button-text").innerText = getI18nMessage("optionsAccentColorSaveButtonText", null, "Save accent color");
        document.getElementById("reset-accent-color-button-text").innerText = getI18nMessage("optionsResetButtonText", null, "Reset");
        document.getElementById("accentColor").setAttribute("aria-label", getI18nMessage("optionsAccentColorPickerLabel", null, "Select accent color"));
        document.getElementById("accent-color-hex").setAttribute("aria-label", getI18nMessage("optionsAccentColorHexLabel", null, "Accent color hex value"));
        document.getElementById("save-accent-color-button").title = getI18nMessage("optionsSaveAccentColorTitle", null, "Save accent color");
        document.getElementById("reset-accent-color-button").title = getI18nMessage("optionsResetAccentColorTitle", null, "Reset accent color");

        document.getElementById("language-title").innerText = getI18nMessage("optionsLanguageTitle", null, "Language");
        document.getElementById("language-note").innerText = getI18nMessage("optionsLanguageNote", null, "Choose which language the extension should use.");
        document.getElementById("save-language-button-text").innerText = getI18nMessage("optionsLanguageSaveButtonText", null, "Save language");
        document.getElementById("reset-language-button-text").innerText = getI18nMessage("optionsResetButtonText", null, "Reset");
        document.getElementById("language-select").setAttribute("aria-label", getI18nMessage("optionsLanguageSelectLabel", null, "Select language"));
        document.getElementById("save-language-button").title = getI18nMessage("optionsSaveLanguageTitle", null, "Save language");
        document.getElementById("reset-language-button").title = getI18nMessage("optionsResetLanguageTitle", null, "Reset language to automatic");

        for (const optionElement of languageSelect.options) {
            optionElement.innerText = getLanguageOptionLabel(optionElement.value);
        }
    }

    function showStatus(message) {
        statusMessage.textContent = message;
        window.setTimeout(function () {
            if (statusMessage.textContent === message) {
                statusMessage.textContent = "";
            }
        }, 2500);
    }
});

function normalizeSystemMessage(systemMessage) {
    if (typeof systemMessage !== "string") {
        return "";
    }

    return systemMessage.trim().slice(0, 4000);
}

function fallbackAccentColor(accentColor) {
    if (typeof accentColor !== "string") {
        return "#4f8cff";
    }

    const trimmedColor = accentColor.trim();
    if (!/^#(?:[0-9a-fA-F]{6})$/.test(trimmedColor)) {
        return "#4f8cff";
    }

    return trimmedColor.toLowerCase();
}

function normalizeAccentColorInputValue(value) {
    if (typeof value !== "string") {
        return "";
    }

    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
        return "";
    }

    const withHash = trimmedValue.startsWith("#") ? trimmedValue : `#${trimmedValue}`;
    return /^#(?:[0-9a-fA-F]{6})$/.test(withHash) ? withHash.toLowerCase() : "";
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

function fallbackLanguagePreference(languagePreference) {
    if (typeof languagePreference !== "string") {
        return "auto";
    }

    const normalizedPreference = languagePreference.trim().toLowerCase();
    return normalizedPreference === "en" || normalizedPreference === "de" || normalizedPreference === "auto"
        ? normalizedPreference
        : "auto";
}

function fallbackSetLanguagePreference() {
    return Promise.resolve(Object.freeze({ preference: "auto", language: "en" }));
}

function fallbackResolvedLanguage() {
    const language = typeof navigator === "object" && navigator && typeof navigator.language === "string"
        ? navigator.language.toLowerCase()
        : "en";
    return language.startsWith("de") ? "de" : "en";
}
