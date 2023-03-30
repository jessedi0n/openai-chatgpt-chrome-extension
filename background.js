chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "install") {
        chrome.tabs.create({ url: "options.html" });
    }
});

chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
    if (request.query) {
        // get the API key and previous messages from local storage
        let apiKey = await new Promise(resolve => chrome.storage.local.get(['apiKey'], result => resolve(result.apiKey)));
        let prevMessages = await new Promise(resolve => chrome.storage.local.get(['prevMessages'], result => resolve(result.prevMessages)));

        // add previous messages to the messages parameter
        let messages = [];
        if (prevMessages) {
            messages = prevMessages.concat([{ "role": "user", "content": request.query }]);
        } else {
            messages = [
                { "role": "system", "content": "you a are a helpful chat bot. your answer should not be too long." },
                { "role": "user", "content": request.query }
            ];
        }

        try {
            // send the query to the OpenAI API
            let response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    "model": "gpt-4",
                    "messages": messages
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch. Status code: ${response.status}`);
            }
            let data = await response.json();
            console.log(data);
            if (data && data.choices && data.choices.length > 0) {
                // get the answer from the API response
                let answer = data.choices[0].message.content;
                // remove newlines from the answer if its the first character
                if (answer.startsWith("\n")) {
                    answer = answer.substring(1);
                }
                // send the answer back to the content script and store the previous messages
                chrome.runtime.sendMessage({ answer: answer });
                chrome.storage.local.set({ prevMessages: messages });
            } else {
                chrome.runtime.sendMessage({ answer: "No answer Found. Make sure your API-Key is valid." });
            }
        } catch (error) {
            console.error("Error:", error);
            chrome.runtime.sendMessage({ answer: `Error: ${error.message}` });
        }
    }
    return true;
});
