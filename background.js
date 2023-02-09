chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "install") {
        chrome.tabs.create({ url: "options.html" });
    }
});

chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
    if (request.query) {
        // get the API key from local storage
        let apiKey = await new Promise(resolve => chrome.storage.local.get(['apiKey'], result => resolve(result.apiKey)));
        try {
            // send the query to the OpenAI API
            let response = await fetch('https://api.openai.com/v1/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    "model": "text-davinci-003",
                    "prompt": request.query,
                    "max_tokens": 400,
                    "temperature": 0.5
                })
            });
            let data = await response.json();
            console.log(data);
            if (data && data.choices && data.choices.length > 0) {
                // get the answer from the API response
                let answer = data.choices[0].text;
                // send the answer back to the content script
                chrome.runtime.sendMessage({ answer: answer });
            } else {
                chrome.runtime.sendMessage({ answer: "No answer Found. Make sure your API-Key is valid." });
            }
        } catch (error) {
            console.error("Error:", error);
            if (error.error && error.error.message) {
                // send the error message back to the content script
                chrome.runtime.sendMessage({ answer: error.error.message });
            }
        }
    }
    return true;
});
