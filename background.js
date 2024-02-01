// helper function that gets the contents of the current tab the user is on
function getCurrentTabContent() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            let tab = tabs[0];
            chrome.tabs.sendMessage(tab.id, { method: "getContent" }, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(response);
            });
        });
    });
}

// Initialize chat history
let chatHistory;

// Listen for when the extension is installed
chrome.runtime.onInstalled.addListener(function () {
    // Set default API model
    let defaultModel = "gpt-3.5-turbo-1106";
    chrome.storage.local.set({ apiModel: defaultModel });

    // Set empty chat history
    chrome.storage.local.set({ chatHistory: [] });

    // Open the options page
    chrome.runtime.openOptionsPage();
});

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener(async function (message, sender, sendResponse) {

    if (message.userInput) {

        // Get the API key from local storage
        const { apiKey } = await getStorageData(["apiKey"]);
        // Get the model from local storage
        const { apiModel } = await getStorageData(["apiModel"]);

        // get the chat history from local storage
        const result = await getStorageData(["chatHistory"]);

        // get tab content
        const tabContent = await getCurrentTabContent();

        if (!result.chatHistory || result.chatHistory.length === 0) {
            chatHistory = [
                { role: "system", content: "You are a helpful chat bot! The user will ask you questions, and you should provide helpful and concise answers in the language that the user uses." },
            ];
            
            if (tabContent.data) {
                chatHistory.push({ role: "system", content: "The user has opened a web page. If needed, you can use the content of the web page as context. The content is below:" + tabContent.data})
            }
        } else {
            chatHistory = result.chatHistory;
        }

        // save user's message to message array
        chatHistory.push({ role: "user", content: message.userInput });

        // Send the user's message to the OpenAI API
        const response = await sendRequest(chatHistory, apiKey, apiModel);

        if (response && response.choices && response.choices.length > 0) {

            // Get the assistant's response
            const assistantResponse = response.choices[0].message.content;

            // Add the assistant's response to the message array
            chatHistory.push({ role: "assistant", content: assistantResponse });

            // save message array to local storage
            chrome.storage.local.set({ chatHistory: chatHistory });

            // Send the assistant's response to the popup script
            chrome.runtime.sendMessage({ answer: assistantResponse });

            console.log("Sent response to popup:", assistantResponse);
        }
    }

    return true; // Enable response callback
});

// Fetch data from the OpenAI API
async function sendRequest(messages, apiKey, apiModel) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                "messages": messages,
                "model": apiModel,
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Unauthorized - Incorrect API key
                throw new Error("Looks like your API key is incorrect. Please check your API key and try again.");
            } else {
                throw new Error(`Failed to fetch. Status code: ${response.status}`);
            }
        }

        return await response.json();
    } catch (error) {
        // Send a response to the popup script
        chrome.runtime.sendMessage({ error: error.message });

        console.error(error);
    }
}

// Get data from local storage
function getStorageData(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result));
    });
}