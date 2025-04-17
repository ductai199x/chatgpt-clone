# ChatGPT Clone

A versatile chat interface for interacting with various AI language models through a clean, intuitive UI. This application lets users connect to OpenAI, Anthropic, and Google AI models using their own API keys.

![ChatGPT Clone Screenshot](public/screenshot.png)

## Features

- **Multi-Provider Support**: Seamlessly switch between OpenAI, Anthropic, and Google AI models
- **Response Streaming**: Real-time streaming responses from all supported providers
- **Rich Message Versioning**: Regenerate responses and maintain conversation branches
- **Image Upload**: Support for multimodal conversations with image uploads (up to 5MB per image)
- **Customizable AI Parameters**: Adjust temperature, max tokens, and system prompts
- **Local Persistence**: Conversations and settings saved to localStorage
- **Responsive Design**: Optimized for both desktop and mobile devices
- **Theme Support**: Toggle between light and dark mode
- **Client-Side Architecture**: Privacy-focused with user-provided API keys

### Planned Features

- Support for additional file types beyond images
- Image generation capabilities
- Implementing Anthropic's artifact features
- Persistent storage options beyond localStorage

## Getting Started

### Prerequisites

- Node.js 18.0 or later
- Modern web browser (Chrome, Edge, Firefox, etc.)
- API keys for providers you wish to use (OpenAI, Anthropic, and/or Google AI)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chatgpt-clone.git
   cd chatgpt-clone
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Setting Up API Keys

1. Click on the settings icon in the sidebar
2. Select the provider tab you want to use
3. Enter your API key in the designated field
4. Save settings and start chatting

## Deployment

This application can be deployed on various platforms:

### Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm install -g netlify-cli
netlify deploy
```

### Self-Hosted
```bash
npm run build
npm start
```

## Limitations

- **API Rate Limits**: The application is subject to the rate limits of the provider APIs based on your account tier
- **File Support**: Currently only supports image uploads up to 5MB per image
- **Browser Storage**: Conversations are stored in browser localStorage and may be lost if cleared

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 

## Attribution Request

While not required by the license, we appreciate if you provide a visible attribution to this project if you use it as a base for your application.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [React](https://reactjs.org/)
- UI components from [Radix UI](https://www.radix-ui.com/)
- Styling with [Tailwind CSS](https://tailwindcss.com/)
- State management with [Zustand](https://github.com/pmndrs/zustand)
