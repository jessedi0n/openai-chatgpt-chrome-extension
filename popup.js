// Description: This file contains the JavaScript code for the popup.html file
window.onload = function () {

    // when the popup is opened, focus on the input field
    document.getElementById("query-input").focus();
    // disable the submit button by default
    const button = document.getElementById("submit-button");
    if (button) {
        button.disabled = true;
    }
    // if the input is "" then disable the submit button
    document.getElementById("query-input").addEventListener("input", function () {
        if (document.getElementById("query-input").value == "") {
            document.getElementById("submit-button").disabled = true;
        } else {
            document.getElementById("submit-button").disabled = false;
        }
    });

    // if the user presses enter, click the submit button
    document.getElementById("query-input").addEventListener("keyup", function (event) {
        if (event.code === "Enter") {
            event.preventDefault();
            document.getElementById("submit-button").click();
        }
    });

    // Initialize an empty array to store the queries and answers
    let queriesAnswers = [];

    // listen for clicks on the clear button 
    document.getElementById("clear-button").addEventListener("click", function () {
        // clear the queriesAnswers array from local storage
        chrome.storage.local.set({ queriesAnswers: [] }, function () {
            console.log("queriesAnswers array cleared");
        });
        // hide the last query and answer
        document.getElementById("show-hide-wrapper").style.display = "none";
        // clear the queriesAnswers container
        document.getElementById("queriesAnswersContainer").innerHTML = "";
    });

    // for each queriesAnswers array item, create an HTML element and append it to the container
    function displayQueriesAnswers() {
        chrome.storage.local.get(['queriesAnswers'], function (result) {
            if (result.queriesAnswers) {
                queriesAnswers = result.queriesAnswers;
                // reverse the array so that the last item is displayed first
                queriesAnswers.reverse();
                // if the queriesAnswers array is not empty
                if (queriesAnswers.length > 0) {
                    // show the last query and answer
                    document.getElementById("show-hide-wrapper").style.display = "flex";
                    // clear the queriesAnswers container
                    document.getElementById("queriesAnswersContainer").innerHTML = "";
                    // iterate through the queriesAnswers array and display each item
                    for (let i = 0; i < queriesAnswers.length; i++) {
                        let query = queriesAnswers[i].query;
                        let answer = queriesAnswers[i].answer;
                        let timeStampValue = queriesAnswers[i].timeStamp;
                        // create an HTML element to display the query and answer
                        let item = document.createElement('div');
                        item.className = "queriesAnswers";
                        // add margin on on the bottom of each item except the last one
                        if (i < queriesAnswers.length - 1) {
                            item.style.marginBottom = "0.5rem";
                        }
                        // create a remove button
                        let removeButton = '<button id=removeButton' + i + ' class="btn removeButton" title="Remove this query and answer from the list"><i class="fa fa-trash"></i></button>';
                        // create a copy button
                        let copyButton = '<button id=copyLastAnswer' + i + ' class="btn copyButton" title="Copy the Answer to the Clipboard"><i class="fa fa-clipboard" style="font-size: small"></i></button>';
                        // create a time stamp the time now in the format hh:mm:ss
                        let timeStamp = '<div class="timeStamp">' + timeStampValue + '</div>';
                        // add query, answer and the copy button to the HTML element
                        item.innerHTML = '<div style="color: rgb(188, 188, 188); margin-bottom: 0.2rem;">' + query + '</div><div>' + answer + '</div>' + '<div class="copyRow">' + timeStamp + '<div>' + removeButton + copyButton + '</div>' + '</div>';
                        // append the item to the container element
                        document.getElementById("queriesAnswersContainer").appendChild(item);
                        // add event listener to the remove button
                        document.getElementById('removeButton' + i).addEventListener("click", function () {
                            // remove the item from the queriesAnswers array
                            queriesAnswers.splice(i, 1);
                            // update the queriesAnswers array in local storage
                            chrome.storage.local.set({ queriesAnswers: queriesAnswers }, function () {
                                console.log("queriesAnswers array updated");
                            });
                            // remove the item from the container
                            item.remove();
                            // if the queriesAnswers array is empty, hide the last query and answer
                            if (queriesAnswers.length == 0) {
                                document.getElementById("show-hide-wrapper").style.display = "none";
                                document.getElementById("queriesAnswersContainer").style.display = "none";
                            }
                        });
                        // add event listener to copy button
                        document.getElementById("copyLastAnswer" + i).addEventListener("click", function () {
                            // get the answer text
                            let answerText = queriesAnswers[i].answer;
                            // copy the answer text to the clipboard
                            navigator.clipboard.writeText(answerText).then(function () {
                                console.log("Answer text copied to clipboard");
                            }, function (err) {
                                console.error("Could not copy text: ", err);
                            });
                        });
                    }
                } else {
                    // hide the last query and answer
                    document.getElementById("show-hide-wrapper").style.display = "none";
                }
            }
        });
    }



    // listen for clicks on the submit button
    document.getElementById("submit-button").addEventListener("click", function () {
        // get the query from the input field
        var query = document.getElementById("query-input").value;
        // send the query to the background script
        chrome.runtime.sendMessage({ query: query });
        // clear the answer
        document.getElementById("answer").innerHTML = "";
        // hide the answer
        document.getElementById("answerWrapper").style.display = "none";
        // show the loading indicator
        document.getElementById("loading-indicator").style.display = "block";

        // create queriesAnswers array from local storage 
        displayQueriesAnswers();
    });

    // listen for messages from the background script
    chrome.runtime.onMessage.addListener(function (message) {
        if (message.answer) {
            document.getElementById("answerWrapper").style.display = "block";
            // remove the newlines from the answer
            var answer = message.answer;
            // update the popup with the answer and give it a typewriter effect
            var i = 0;
            let typing = setInterval(function () {
                document.getElementById("answer").innerHTML += answer.charAt(i);
                i++;
                if (i > answer.length) {
                    clearInterval(typing);
                }
            }, 30);
            // add event listener to copy button
            document.getElementById("copyAnswer").addEventListener("click", function () {
                // get the answer text
                let answerText = answer;
                // copy the answer text to the clipboard
                navigator.clipboard.writeText(answerText).then(function () {
                    console.log("Answer text copied to clipboard");
                }, function (err) {
                    console.error("Could not copy text: ", err);
                });
            });
            // give the span with the id timestamp the current time
            document.getElementById("timestamp").innerText = new Date().toLocaleTimeString();

            // hide the loading indicator
            document.getElementById("loading-indicator").style.display = "none";
            // get the query from the input field
            var query = document.getElementById("query-input").value;
            // save the query and answer to the queriesAnswers array and add a timestamp to the last query and answer
            queriesAnswers.push({ query: query, answer: answer, timeStamp: new Date().toLocaleTimeString() });

            // save the array to local storage and add a timestamp to the last query and answer
            chrome.storage.local.set({ queriesAnswers: queriesAnswers, lastQuery: query, lastAnswer: answer, lastTimeStamp: new Date().toLocaleTimeString() }, function () {
                console.log("queriesAnswers array updated");
            });
        } else if (message.error) {
            document.getElementById("answerWrapper").style.display = "block";
            document.getElementById("answer").innerText = message.error;
            document.getElementById("loading-indicator").style.display = "none";
        }
    });

    // Get the button and the last request element
    let showHideLastAnswerButton = document.getElementById('show-hide-last-answer-button');
    let showHideWrapper = document.getElementById('show-hide-wrapper');

    // Initially hide the last request
    let queriesAnswersContainer = document.getElementById('queriesAnswersContainer');
    queriesAnswersContainer.style.display = "none";
    showHideWrapper.style.display = "none";
    // get localised strings
    document.getElementById("lastRequestsTitle").innerText = chrome.i18n.getMessage("lastRequestsTitle");

    // Add a click event listener to the button
    showHideLastAnswerButton.addEventListener('click', function () {
        // If the last answer is currently hidden
        if (queriesAnswersContainer.style.display == "none") {
            // Show the last answer
            queriesAnswersContainer.style.display = "block";
            // Change the button text to "Hide Last Answer"
            showHideLastAnswerButton.innerHTML = '<i class="fa fa-eye-slash"></i>';
        } else {
            // Hide the last answer
            queriesAnswersContainer.style.display = "none";
            // Change the button text to "Show Last Answer"
            showHideLastAnswerButton.innerHTML = '<i class="fa fa-eye"></i>';
        }
    });

    // create queriesAnswers array from local storage on popup open
    displayQueriesAnswers();
}