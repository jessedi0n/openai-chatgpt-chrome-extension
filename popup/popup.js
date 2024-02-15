document.addEventListener('DOMContentLoaded', function () {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    let isImageGenerationActive = false;

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
            // hide the system message
            chatHistory.shift();

            // display the chat history
            displayMessages(chatHistory);

            // scroll to bottom of chat-messages div    
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        checkClearChatBtn();
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
        } else if (message.imageUrl) {
            // Display the image in the chat
            displayMessage('assistant', message.imageUrl);
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

        // check of message starts with a dall-e image URL
        if (content.startsWith('https://oaidalleapiprodscus.blob.core.windows.net/')) {
            const imageElement = document.createElement('img');
            imageElement.src = content;
            messageElement.appendChild(imageElement);

            // add a download button to the message if it's from the assistant
            if (role === 'assistant') {
                // create container for the action buttons
                const actionBtns = document.createElement('div');
                actionBtns.className = 'action-btns';

                // add the action buttons to the message
                messageElement.appendChild(actionBtns);

                const downloadIcon = document.createElement('i');
                downloadIcon.className = 'fa fa-download download-btn';
                downloadIcon.title = 'Download image';
                downloadIcon.addEventListener('click', function () {
                    // download image to the user's device
                    chrome.downloads.download({
                        url: content,
                        filename: 'dall-e-image.png',
                        saveAs: false
                    })
                        .then(() => {
                            // Change the icon to a check
                            downloadIcon.className = 'fa fa-check action-btn';

                            // Revert to the default icon after 2 seconds
                            setTimeout(() => {
                                downloadIcon.className = 'fa fa-download action-btn';
                            }, 2000);
                        })
                        // Display an x icon if the copy operation fails
                        .catch(() => {
                            downloadIcon.className = 'fa fa-times action-btn';

                            // Revert to the default icon after 2 seconds
                            setTimeout(() => {
                                downloadIcon.className = 'fa fa-download action-btn';
                            }, 2000);
                        });

                });

                actionBtns.appendChild(downloadIcon);
            }

        } else { // if it's not an image, it's a text message
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
                copyIcon.className = 'fa fa-copy action-btn';
                copyIcon.title = 'Copy to clipboard';
                copyIcon.addEventListener('click', function () {
                    // Copy the message to the clipboard
                    navigator.clipboard.writeText(content)
                        .then(() => {
                            // Change the icon to a check
                            copyIcon.className = 'fa fa-check action-btn';

                            // Revert to the default icon after 2 seconds
                            setTimeout(() => {
                                copyIcon.className = 'fa fa-copy action-btn';
                            }, 2000);
                        })
                        // Display an x icon if the copy operation fails
                        .catch(() => {
                            copyIcon.className = 'fa fa-times action-btn';

                            // Revert to the default icon after 2 seconds
                            setTimeout(() => {
                                copyIcon.className = 'fa fa-copy action-btn';
                            }, 2000);
                        });
                });

                actionBtns.appendChild(copyIcon);
            }

        }
        chatMessages.appendChild(messageElement);

        // enable the clear chat button
        checkClearChatBtn();

        // scroll to the displayed message in the chat-messages div
        messageElement.scrollIntoView();
    }

    // Function to display an array of messages
    function displayMessages(messages) {
        for (const message of messages) {
            displayMessage(message.role, message.content);
        }
    }

    // fucntion to check if the clear chat button should be enabled or disabled
    function checkClearChatBtn() {
        chrome.storage.local.get(['chatHistory'], function (result) {
            const chatHistory = result.chatHistory || [];
            if (chatHistory.length > 0) {
                clearChatBtn.disabled = false;
            } else {
                clearChatBtn.disabled = true;
            }
        });
    }

    // Clear the chat history when the clear chat button is clicked
    clearChatBtn.addEventListener('click', function () {
        // Display a confirmation popup
        const isConfirmed = window.confirm('Are you sure you want to clear the chat history?');

        // If the user confirms, clear the chat history
        if (isConfirmed) {
            chrome.storage.local.set({ chatHistory: [] }, function () {
                console.log('Chat history cleared');
                chatMessages.innerHTML = '';
                sendBtn.disabled = true;
                checkClearChatBtn();
            });
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
