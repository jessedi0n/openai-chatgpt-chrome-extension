window.onload = function () {
    // get localised strings
    document.getElementById("titleText").innerText = chrome.i18n.getMessage("optionsTitle");
    document.getElementById("apiText").innerText = chrome.i18n.getMessage("apiTitle");
    document.getElementById("choose-model-text").innerText = chrome.i18n.getMessage("apiModelTitle");

    // disable the submit button by default
    const button = document.getElementById("submit");
    button.disabled = true;

    // if the input is "" then disable the submit button
    document.getElementById("content").addEventListener("input", function () {
        if (document.getElementById("content").value.length < 10) {
            button.disabled = true;
        } else {
            button.disabled = false;
        }
    });

    // submit the api key to the local storage
    document.getElementById("submit").addEventListener("click", function (event) {
        event.preventDefault();
        let apiKey = document.getElementById("content").value;
        chrome.storage.local.set({ apiKey: apiKey }, function () {
            console.log("API key saved: " + apiKey);
            document.getElementById("status").innerHTML = "API-Key saved. The extension is ready to use.";
            document.getElementById("status").style.color = "lightgreen";
            document.getElementById("content").value = "";
        });
        // disable the submit button
        button.disabled = true;
    });

    // delete the api key from the local storage
    function deleteAPIKey() {
        chrome.storage.local.set({ apiKey: "" }, function () {
            console.log("API key deleted.");
        });
    }

    // reset the api key on button click
    document.getElementById("reset").addEventListener("click", function (event) {
        event.preventDefault();
        deleteAPIKey();
        document.getElementById("status").innerHTML = "API-Key deleted. Please enter a new API-Key.";
        document.getElementById("status").style.color = "red";
    });

    // Get the dropdown element
    const apiModelSelect = document.getElementById('apiModel');

    // Load the saved API model setting from Chrome storage and set the dropdown to the saved value
    chrome.storage.local.get('apiModel', ({ apiModel }) => {
        if (!apiModel) {
            defaultModel = "gpt-3.5-turbo"; // set default API model if none is saved
            chrome.storage.local.set({ apiModel: defaultModel });
            apiModelSelect.value = defaultModel;
        } else {
            apiModelSelect.value = apiModel;
        }
    });

    // Save the selected API model to Chrome storage when the dropdown value changes
    apiModelSelect.addEventListener('change', () => {
        const selectedApiModel = apiModelSelect.value;

        chrome.storage.local.set({ apiModel: selectedApiModel }, function () {
            console.log("API model saved: " + selectedApiModel);
        });
    });


}
