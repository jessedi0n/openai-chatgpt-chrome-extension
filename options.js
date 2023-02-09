window.onload = function () {
    // get localised strings
    document.getElementById("titleText").innerText = chrome.i18n.getMessage("optionsTitle");
    document.getElementById("apiText").innerText = chrome.i18n.getMessage("apiTitle");

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
            document.getElementById("status").innerHTML = "API-Key saved. You can now use the extension.";
            document.getElementById("status").style.color = "white";
            document.getElementById("content").value = "";

            // hide status message after 3 seconds
            setTimeout(function () {
                document.getElementById("status").innerHTML = "";
            }
                , 3000);
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
        document.getElementById("status").innerHTML = "API-Key deleted. You need to enter a new API-Key.";
        document.getElementById("status").style.color = "red";
        // hide status message after 3 seconds
        setTimeout(function () {
            document.getElementById("status").innerHTML = "";
        }
            , 3000);
    });

    // hide status message after 3 seconds
    setTimeout(function () {
        document.getElementById("status").innerHTML = "";
    }
        , 3000);
}
