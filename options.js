window.addEventListener('load', () => {
    // Get localized strings
    const titleText = document.getElementById('titleText');
    const apiText = document.getElementById('apiText');
    const chooseModelText = document.getElementById('choose-model-text');
    titleText.innerText = chrome.i18n.getMessage('optionsTitle');
    apiText.innerText = chrome.i18n.getMessage('apiTitle');
    chooseModelText.innerText = chrome.i18n.getMessage('apiModelTitle');

    // Disable the submit button by default
    const button = document.getElementById('submit');
    button.disabled = true;

    // Get the input field
    const content = document.getElementById('content');

    // Hide the API key input field
    content.type = 'password';

    // Enable the submit button if the input field is not empty
    content.addEventListener('input', () => {
        button.disabled = content.value.length < 10;
    });

    // insert the saved API key into the input field if it exists
    chrome.storage.local.get('apiKey', ({ apiKey }) => {
        if (apiKey) {
            content.value = apiKey;
        }
    });

    // Save the insert API key to local storage
    const submit = document.getElementById('submit');
    submit.addEventListener('click', (event) => {
        event.preventDefault();
        const apiKey = content.value;
        chrome.storage.local.set({ apiKey }, () => {
            const status = document.getElementById('status');
            status.innerHTML = 'API key saved. The extension is ready to use.';
            status.style.color = 'lightgreen';
        });
        button.disabled = true;
    });

    // Delete the API key from local storage
    function deleteApiKey() {
        chrome.storage.local.set({ apiKey: '' });
        content.value = '';
    }

    // Reset the API key on button click
    const reset = document.getElementById('reset');
    reset.addEventListener('click', (event) => {
        event.preventDefault();
        deleteApiKey();
        const status = document.getElementById('status');
        status.innerHTML = 'API key deleted. Please enter a new API key.';
        status.style.color = 'red';
    });

    // Set up the API model select dropdown
    const apiModelSelect = document.getElementById('apiModel');

    // Load the saved API model setting from Chrome storage and set the dropdown to the saved value
    chrome.storage.local.get('apiModel', ({ apiModel }) => {
        const defaultModel = 'gpt-3.5-turbo';
        if (!apiModel) {
            chrome.storage.local.set({ apiModel: defaultModel });
            apiModelSelect.value = defaultModel;
        } else {
            apiModelSelect.value = apiModel;
        }
    });

    // Save the selected API model to Chrome storage when the dropdown value changes
    apiModelSelect.addEventListener('change', () => {
        chrome.storage.local.set({ apiModel: apiModelSelect.value });
    });
});