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
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] py-8 px-4 text-center">
      <h1 className="text-4xl font-bold mb-2">ChatGPT Clone</h1>
      <p className="text-muted-foreground mb-8">
        A powerful chat interface powered by {model}
      </p>
      
      {/* Examples */}
      <div className="w-full max-w-md mb-8">
        <h2 className="text-lg font-medium mb-4">Examples</h2>
        <div className="grid gap-3">
          {filteredExamples.map((example, index) => (
            <Button
              key={index}
              variant="outline"
              className="justify-between text-sm font-normal h-auto py-3 px-4"
              onClick={() => handleExampleClick(example)}
              disabled={selectedExample?.text === example.text}
            >
              <span className="text-left">{example.text}</span>
              <ArrowRight className="h-4 w-4 ml-2 shrink-0" />
            </Button>
          ))}
        </div>
      </div>
      
      {/* Capabilities */}
      <div className="w-full max-w-md">
        <h2 className="text-lg font-medium mb-4">Capabilities</h2>
        <div className="grid gap-3">
          {filteredCapabilities.map((capability, index) => (
            <div
              key={index}
              className="border border-border rounded-lg p-3 text-sm text-left"
            >
              {capability.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}