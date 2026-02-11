# OpenAI ChatGPT Chrome Extension

A Chrome extension that brings OpenAI chat and image generation into a compact popup.

The project is built on top of the OpenAI Responses API for chat and the Images API for image generation, with streaming output, model switching, and and web search.

## Screenshots

![Chat Preview](assets/preview-1.png)
![Image Preview](assets/preview-2.png)

## What It Does

- Chat with OpenAI GPT models from the browser toolbar popup
- Generate images with OpenAI image models
- Stream assistant responses token-by-token
- Stop in-progress responses
- Regenerate the last assistant response
- Copy assistant text responses
- Download generated images
- Attach files/images to chat prompts (up to 6 files, 10 MB per file in the UI)
- Use a custom system message
- Toggle web search for supported chat models
- Select model-specific reasoning effort where supported
- Persist chat history and settings in local browser storage

## Supported Models (Current Config)

### Chat models

- `gpt-5.2` (thinking + web search)
- `gpt-5.1` (thinking + web search)
- `gpt-5-pro` (thinking + web search)
- `gpt-5-mini` (thinking + web search)
- `gpt-5-nano` (thinking + web search)

### Image models

- `gpt-image-1.5`
- `gpt-image-1-mini`

## Reasoning Effort

The thinking dropdown is model-aware.

- Values include: `default`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh`
- The extension only shows values supported by the selected model
- `default` maps to the model's default reasoning effort

## Web Search

- A web search toggle is available in the popup header
- It is only shown for models that support web search
- When enabled, chat requests include the `web_search` tool

## Installation

1. Clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this repository folder.
5. Open extension **Options** and save your OpenAI API key.

## Configuration

Open the options page to configure:

- OpenAI API key
- Custom system message
- Accent color (picker + hex input)

## Usage

1. Open the extension popup.
2. Choose a model.
3. For chat models, optionally choose thinking level and web search.
4. Type a prompt (and optionally attach files/images for chat models).
5. Send.

## Data and Privacy

- API key is stored in `chrome.storage.local`
- Chat history is stored in `chrome.storage.local`
- Extension requests are sent directly to `https://api.openai.com/v1`
- No separate backend service is used by this project

## Development Notes

- No build step required
- Plain JavaScript + CSS + HTML (Manifest V3)
- Reload the extension in `chrome://extensions` after code changes

## License

See [`LICENSE`](LICENSE).
