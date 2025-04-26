'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WelcomeScreen({ onSendMessage, provider, model }) {
  const [selectedExample, setSelectedExample] = useState(null);

  // Example prompts based on the selected provider/model
  const examples = [
    {
      text: "Explain quantum computing in simple terms",
      provider: "all",
    },
    {
      text: "Write a short story about a robot learning to love",
      provider: "all",
    },
    {
      text: "How do I make a HTTP request in JavaScript?",
      provider: "all",
    },
    {
      text: "Generate a marketing plan for a new fitness app",
      provider: "all",
    },
  ];

  // Capabilities based on the selected provider/model
  const capabilities = [
    {
      title: "Remembers what you said earlier in the conversation",
      provider: "all",
    },
    {
      title: "Allows you to upload images for analysis",
      provider: "all",
    },
    {
      title: "Can process and work with up to 5 images per message",
      provider: "all",
    },
    {
      title: "Trained on vast amounts of data to answer a wide range of questions",
      provider: "all",
    },
  ];

  // Filter capabilities and examples based on provider
  const filteredExamples = examples.filter(
    example => example.provider === "all" || example.provider === provider
  );

  const filteredCapabilities = capabilities.filter(
    capability => capability.provider === "all" || capability.provider === provider
  );

  // Handle example click
  const handleExampleClick = (example) => {
    setSelectedExample(example);
    onSendMessage(example.text);
  };

  return (
    <div className="welcome-screen-container">
      <h1 className="welcome-screen-title">ChatGPT Clone</h1>
      <p className="welcome-screen-subtitle">
        A powerful chat interface powered by {model}
      </p>

      {/* Examples Section */}
      <div className="welcome-screen-section">
        <h2 className="welcome-screen-section-title">Examples</h2>
        <div className="welcome-screen-grid">
          {filteredExamples.map((example, index) => (
            <Button
              key={index}
              variant="outline"
              className="welcome-screen-example-button"
              onClick={() => handleExampleClick(example)}
              disabled={selectedExample?.text === example.text}
            >
              <span className="welcome-screen-example-button-text">{example.text}</span>
              <ArrowRight className="welcome-screen-example-button-icon" />
            </Button>
          ))}
        </div>
      </div>

      {/* Capabilities Section */}
      <div className="welcome-screen-section">
        <h2 className="welcome-screen-section-title">Capabilities</h2>
        <div className="welcome-screen-grid">
          {filteredCapabilities.map((capability, index) => (
            <div
              key={index}
              className="welcome-screen-capability-item"
            >
              {capability.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}