chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.method == "getContent"){
    sendResponse({data: document.body.innerText, method: "getContent"}); 
  }
});