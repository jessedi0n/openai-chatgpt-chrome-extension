const queryInput = document.getElementById("query-input");
const submitButton = document.getElementById("submit-button");
const clearButton = document.getElementById("clear-button");
const queriesAnswersContainer = document.getElementById("queriesAnswersContainer");
const showHideWrapper = document.getElementById("show-hide-wrapper");

// Disable submit button by default
if (submitButton) {
  submitButton.disabled = true;
}

// When the popup is opened, focus on the input field
queryInput.focus();

// If the input is "" then disable the submit button
queryInput.addEventListener("input", () => {
  submitButton.disabled = !queryInput.value;
});

// If the user presses enter, click the submit button
queryInput.addEventListener("keyup", (event) => {
  if (event.code === "Enter") {
    event.preventDefault();
    submitButton.click();
  }
});

// Listen for clicks on the clear button 
clearButton.addEventListener("click", () => {
  // Clear the queriesAnswers array from local storage
  chrome.storage.local.set({ queriesAnswers: [] }, () => {
    console.log("queriesAnswers array cleared");
  });
  // Hide the last query and answer
  showHideWrapper.style.display = "none";
  // Clear the queriesAnswers container
  queriesAnswersContainer.innerHTML = "";
  // queriesAnswersContainer.style.display = "none"; s
});

function displayQueriesAnswers() {
  chrome.storage.local.get(['queriesAnswers'], ({ queriesAnswers }) => {
    // Check if queriesAnswers is null or empty
    if (!queriesAnswers || queriesAnswers.length === 0) {
      return;
    }
    // Reverse the array so that the last item is displayed first
    queriesAnswers = queriesAnswers.reverse();
    // If the queriesAnswers array is not empty
    if (queriesAnswers.length > 0) {
      // Show the last query and answer
      showHideWrapper.style.display = "flex";
      // Clear the queriesAnswers container
      queriesAnswersContainer.innerHTML = "";
      // Iterate through the queriesAnswers array and display each item
      queriesAnswers.forEach(({ query, answer, timeStamp }, i) => {
        // Create an HTML element to display the query and answer
        const item = document.createElement('div');
        item.className = "queriesAnswers";
        // Add margin on the bottom of each item except the last one
        item.style.marginBottom = i < queriesAnswers.length - 1 ? "0.5rem" : "0";
        // Create a remove button
        const removeButton = `<button id=removeButton${i} class="btn removeButton" title="Remove this query and answer from the list"><i class="fa fa-trash"></i></button>`;
        // Create a copy button
        const copyButton = `<button id=copyLastAnswer${i} class="btn copyButton" title="Copy the Answer to the Clipboard"><i class="fa fa-clipboard" style="font-size: small"></i></button>`;
        // Create a time stamp the time now in the format hh:mm:ss
        const time = new Date().toLocaleTimeString();
        const timeStampElem = `<div class="timeStamp">${timeStamp || time}</div>`;
        // Add query, answer, copy button, and remove button to the HTML element
        item.innerHTML = `
          <div style="color: rgb(188, 188, 188); margin-bottom: 0.2rem;">${query}</div>
          <div>${answer}</div>
          <div class="copyRow">
            ${timeStampElem}
            <div>${removeButton}${copyButton}</div>
          </div>
        `;
        // Append the item to the container element
        queriesAnswersContainer.appendChild(item);
        // Add event listener to the remove button
        document.getElementById(`removeButton${i}`).addEventListener("click", () => {
          // Remove the item from the queriesAnswers array
          queriesAnswers.splice(i, 1);
          // Update the queriesAnswers array in local storage
          chrome.storage.local.set({ queriesAnswers }, () => {
            console.log("queriesAnswers array updated");
          });
          // Remove the item from the container
          item.remove();
          // If the queriesAnswers array is empty, hide the last query and answer
          if (queriesAnswers.length === 0) {
            showHideWrapper.style.display = "none";
            queriesAnswersContainer.style.display = "none";
          }
        });
        // Add event listener to copy button
        document.getElementById(`copyLastAnswer${i}`).addEventListener("click", () => {
          // Get the answer text
          const answerText = answer;
          // Copy the answer text to the clipboard
          navigator.clipboard.writeText(answerText)
            .then(() => console.log("Answer text copied to clipboard"))
            .catch((err) => console.error("Could not copy text: ", err));
        });
      });
    } else {
      // Hide the last query and answer
      showHideWrapper.style.display = "none";
    }
  });
}

// Listen for clicks on the submit button
submitButton.addEventListener("click", () => {
  // Get the query from the input field
  const query = queryInput.value;
  // Send the query to the background script
  chrome.runtime.sendMessage({ query });
  // Clear the answer
  document.getElementById("answer").innerHTML = "";
  // Hide the answer
  document.getElementById("answerWrapper").style.display = "none";
  // Show the loading indicator
  document.getElementById("loading-indicator").style.display = "block";
  // Create queriesAnswers array from local storage 
  displayQueriesAnswers();
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(({ answer, error }) => {
  if (answer) {
    // Show the answer
    document.getElementById("answerWrapper").style.display = "block";
    // Remove the newlines from the answer
    answer = answer.replace(/\n/g, "");
    // Update the popup with the answer and give it a typewriter effect
    // let i = 0;
    // const typing = setInterval(() => {
    //   document.getElementById("answer").innerHTML += answer.charAt(i);
    //   i++;
    //   if (i > answer.length) {
    //     clearInterval(typing);
    //   }
    // }, 30);
    document.getElementById("answer").innerHTML += answer;
    // Add event listener to copy button
    document.getElementById("copyAnswer").addEventListener("click", () => {
      // Get the answer text
      const answerText = answer;
      // Copy the answer text to the clipboard
      navigator.clipboard.writeText(answerText)
        .then(() => console.log("Answer text copied to clipboard"))
        .catch((err) => console.error("Could not copy text: ", err));
    });
    // Give the span with the id timestamp the current time
    document.getElementById("timestamp").innerText = new Date().toLocaleTimeString();
    // Hide the loading indicator
    document.getElementById("loading-indicator").style.display = "none";
    // Get the query from the input field
    const query = queryInput.value;
    // Save the query and answer to the queriesAnswers array and add a timestamp to the last query and answer
    chrome.storage.local.get({ queriesAnswers: [] }, ({ queriesAnswers }) => {
      queriesAnswers.push({ query, answer, timeStamp: new Date().toLocaleTimeString() });
      // Save the array to local storage and add a timestamp to the last query and answer
      chrome.storage.local.set({ queriesAnswers }, () => {
        console.log("queriesAnswers array updated");
      });
    });
  } else if (error) {
    // Show the error message
    document.getElementById("answerWrapper").style.display = "block";
    document.getElementById("answer").innerText = error;
    // Hide the loading indicator
    document.getElementById("loading-indicator").style.display = "none";
  }
});

// Get the button and the last request element
const showHideLastAnswerButton = document.getElementById('show-hide-last-answer-button');
// Initially hide the last request
queriesAnswersContainer.style.display = "none";
showHideWrapper.style.display = "none";
// Get localised strings
document.getElementById("lastRequestsTitle").innerText =
  chrome.i18n.getMessage("lastRequestsTitle");
// Add a click event listener to the button
showHideLastAnswerButton.addEventListener('click', () => {
  // If the last answer is currently hidden
  if (queriesAnswersContainer.style.display === "none") {
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

// Create queriesAnswers array from local storage on popup open
displayQueriesAnswers();