document.addEventListener('DOMContentLoaded', function () {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    // If the user has not entered an API key, open the options page
    chrome.storage.local.get('apiKey', ({ apiKey }) => {
        if (!apiKey || apiKey.length < 10) {
            chrome.runtime.openOptionsPage();
        }
    });

    // Fetch chat history from local storage and display it
    chrome.storage.local.get(['chatHistory'], function (result) {
        const chatHistory = result.chatHistory || [];

        if (chatHistory.length > 0) {
            // display the chat history
            displayMessages(chatHistory);

            // scroll to bottom of chat-messages div    
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        setClearChatBtnAction('Clear chat history')
    });

    // focus on the input field
    userInput.focus();

    // disable the send button by default
    sendBtn.disabled = true;

    // disable the send button if the input field is empty
    userInput.addEventListener('keyup', function () {
        if (userInput.value === '') {
            sendBtn.disabled = true;
        } else {
            sendBtn.disabled = false;
        }
    });

    // If the user presses enter, click the send button
    userInput.addEventListener('keyup', function (event) {
        if (event.code === 'Enter') {
            event.preventDefault();
            sendBtn.click();
        }
    });

    // Send user's input to background script when the send button is clicked
    sendBtn.addEventListener('click', function () {
        const userMessage = userInput.value.trim();
        if (userMessage !== '') {
            sendMessage(userMessage);
            userInput.value = ''; // Clear the input field

            // disable the send button
            sendBtn.disabled = true;
            // remove the icon from the send button and add the loading indicator
            sendBtn.innerHTML = '<i class="fa fa-spinner fa-pulse"></i>';

            // disable input field while the assistant is typing
            userInput.disabled = true;

            // scroll to bottom of chat-messages div
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (message.answer) {
            // Display the assistant's response
            displayMessage('assistant', message.answer);
        } else if (message.error) {
            // Display the error message
            displayMessage('system', message.error);
        }

        // Enable the send button again
        sendBtn.disabled = false;
        // Add the send icon to the send button and remove the loading indicator
        sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i>';

        // Enable the input field again
        userInput.disabled = false;
    });

    // Function to send user's input to the background script and display it in the chat
    function sendMessage(userMessage) {
        // Create a message object
        const message = { userInput: userMessage };

        // Send the user's message to the background script
        chrome.runtime.sendMessage(message);

        // Display the user's message in the chat
        displayMessage('user', userMessage);
    }

    // Function to display messages in the chat
    function displayMessage(role, content) {
        const messageElement = document.createElement('div');
        // add id to the message element
        messageElement.classList.add('message');
        messageElement.classList.add(role);

        // Check if the message contains code blocks
        content = content.replace(/```(\w+)([\s\S]*?)```/g, function (match, lang, code) {

            // Create a code element
            var codeElement = document.createElement('code');
            // remove the first line break from the code
            code = code.replace(/^\n/, '');
            //
            codeElement.innerText = code;

            // Create a container for the code element
            var codeContainer = document.createElement('div');
            codeContainer.appendChild(codeElement);

            // Set the class of the container based on the language (optional)
            codeContainer.className = 'code-block';

            // Return the HTML content with the replaced code
            return codeContainer.outerHTML;
        });

        // Append the replaced content to the message container
        messageElement.innerText = content;

        // add a copy button to the message if it's from the assistant
        if (role === 'assistant') {
            // create container for the action buttons
            const actionBtns = document.createElement('div');
            actionBtns.className = 'action-btns';

            // add the action buttons to the message
            messageElement.appendChild(actionBtns);

            const copyIcon = document.createElement('i');
            copyIcon.className = 'fa fa-copy copy-btn';
            copyIcon.title = 'Copy to clipboard';
            copyIcon.addEventListener('click', function () {
                // Copy the message to the clipboard
                navigator.clipboard.writeText(content)
                    .then(() => {
                        // Change the icon to a check
                        copyIcon.className = 'fa fa-check copy-btn';

                        // Revert to the default icon after 2 seconds
                        setTimeout(() => {
                            copyIcon.className = 'fa fa-copy copy-btn';
                        }, 2000);
                    })
                    // Display an x icon if the copy operation fails
                    .catch(() => {
                        copyIcon.className = 'fa fa-times copy-btn';

                        // Revert to the default icon after 2 seconds
                        setTimeout(() => {
                            copyIcon.className = 'fa fa-copy copy-btn';
                        }, 2000);
                    });
            });

            actionBtns.appendChild(copyIcon);
        }

        chatMessages.appendChild(messageElement);

        // scroll to the displayed message in the chat-messages div
        messageElement.scrollIntoView();
    }

    // Function to display an array of messages
    function displayMessages(messages, displaySystemMessages = false) {
        for (const message of messages) {
            if (message.role !== 'system' || displaySystemMessages) {
                displayMessage(message.role, message.content);
            }
        }
    }

    // Define a variable to store the timeout ID
    let restoreTimer = undefined;

    function setClearChatBtnDisabled(disabled) {
        clearChatBtn.disabled = disabled;
    }

    function setClearChatBtnAction(text) {
        clearChatBtn.title = text;
    }

    // Clear the chat history when the clear chat button is clicked
    clearChatBtn.addEventListener('click', function () {
        clearChatBtn.disabled = true;

        // Check if the timeout is already set
        if (restoreTimer) {
            // Restore the chat history
            chrome.storage.local.get(['chatHistoryBackup'], function (result) {
                const chatHistory = result.chatHistoryBackup || [];
                chrome.storage.local.set({ chatHistory: chatHistory }, function () {
                    console.log('Chat history restored');
                    setClearChatBtnDisabled(false);
                    setClearChatBtnAction('Clear chat history');
                });
                displayMessages(chatHistory);
            });

            // Clear the timeout
            clearTimeout(restoreTimer);
            restoreTimer = undefined;
        } else {
            // Clear display of chat history
            chatMessages.innerHTML = '';
            sendBtn.disabled = true;

            // Clear and backup the chat history
            chrome.storage.local.get(['chatHistory'], function (result) {
                const chatHistory = result.chatHistory || [];
                chrome.storage.local.set({ chatHistory: [] }, function () {
                    console.log('Chat history cleared');
                    setClearChatBtnDisabled(false);
                    setClearChatBtnAction('Restore chat history');
                }),
                chrome.storage.local.set({ chatHistoryBackup: chatHistory }, function () {
                    console.log('Chat history backed up');
                });
            });

            restoreTimer = setTimeout(function () {
                restoreTimer = undefined;
            }, 10000);
        }
    });

    // Settings button click event
    document.getElementById('settings-btn').addEventListener('click', function () {
        chrome.runtime.openOptionsPage();
    });

    // Open the dropdown when the button is clicked
    document.getElementById("model-dropdown-btn").addEventListener("click", function () {
        var dropdownContent = document.getElementById("model-dropdown-content");

        // Toggle the display property
        dropdownContent.style.display = (dropdownContent.style.display === "flex") ? "none" : "flex";

        // Add active class to the button if the dropdown is open
        document.getElementById("model-dropdown-btn").classList.toggle("active", dropdownContent.style.display === "flex");
    });


    // Close the dropdown if the user clicks outside of it
    window.addEventListener("click", function (event) {
        if (!event.target.matches('#model-dropdown-btn')) {
            var dropdownContent = document.getElementById("model-dropdown-content");
            if (dropdownContent.style.display === "flex") {
                dropdownContent.style.display = "none";
            }
            // remove active class from the button if the dropdown is closed
            document.getElementById("model-dropdown-btn").classList.remove("active");
        }
    });

    // Handle button clicks in the dropdown
    var dropdownButtons = document.querySelectorAll(".model-dropdown-btn");
    dropdownButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            // Get the ID of the clicked button
            var buttonId = button.id;

            // Set the localStorage value
            chrome.storage.local.set({ apiModel: buttonId });

            // Update the text on the main button
            document.getElementById("model-dropdown-btn-text").innerText = button.innerText;

            // Set active model
            setActiveModel(buttonId);
        });
    });

    function setActiveModel(model) {
        // add active class to the button and remove it from the other buttons
        dropdownButtons.forEach(function (button) {
            button.classList.remove("active");
        });
        document.getElementById(model).classList.add("active");
    }

    // Set the active model when the popup is opened
    chrome.storage.local.get(['apiModel'], function (result) {
        if (result.apiModel) {
            // Update the text on the main button
            document.getElementById("model-dropdown-btn-text").innerText = document.getElementById(result.apiModel).innerText;
            // Set active model in the dropdown
            setActiveModel(result.apiModel);
        }
    });
});
