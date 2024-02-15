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

        if (!result.chatHistory || result.chatHistory.length === 0) {
            chatHistory = [
                { role: "system", content: "I'm your helpful chat bot! I provide helpful and concise answers." },
            ];
        } else {
            chatHistory = result.chatHistory;
        }

        // save user's message to message array
        chatHistory.push({ role: "user", content: message.userInput });

        if (apiModel === "dall-e-3") {
            // Send the user's message to the OpenAI API
            const response = await fetchImage(message.userInput, apiKey, apiModel);

            if (response && response.data && response.data.length > 0) {
                // Get the image URL
                const imageUrl = response.data[0].url;

                // Add the assistant's response to the message array
                chatHistory.push({ role: "assistant", content: imageUrl });

                // save message array to local storage
                chrome.storage.local.set({ chatHistory: chatHistory });

                // Send the image URL to the popup script
                chrome.runtime.sendMessage({ imageUrl: imageUrl });

                console.log("Sent image URL to popup:", imageUrl);
            }
            return true; // Enable response callback
        } else {
            // Send the user's message to the OpenAI API
            const response = await fetchChatCompletion(chatHistory, apiKey, apiModel);

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
            return true; // Enable response callback
        }
    }

    return true; // Enable response callback
});

// Fetch data from the OpenAI Chat Completion API
async function fetchChatCompletion(messages, apiKey, apiModel) {
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

// Fetch Image from the OpenAI DALL-E API
async function fetchImage(prompt, apiKey, apiModel) {
    try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                "prompt": prompt,
                "model": apiModel,
                "n": 1,
                "size": "1024x1024",
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
