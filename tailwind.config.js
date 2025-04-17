/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx,css}',
    './src/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: {
          DEFAULT: "var(--border)",
        },
        input: {
          DEFAULT: "var(--input)",
        },
        ring: {
          DEFAULT: "var(--ring)",
        },
        background: {
          DEFAULT: "var(--background)",
        },
        foreground: {
          DEFAULT: "var(--foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
        },
        assistant: {
          DEFAULT: "var(--assistant)",
        },
        // ChatGPT-specific colors
        chatgpt: {
          dark: "oklch(0.13 0.01 240)",
          sidebardark: "oklch(0.125 0.01 240)",
          light: "oklch(1 0 0)",
          sidebarlight: "oklch(0.985 0 0)",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        "typing-dots": {
          "0%, 100%": { opacity: 0 },
          "50%": { opacity: 1 }
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "typing-dot-1": "typing-dots 1s infinite 0.1s",
        "typing-dot-2": "typing-dots 1s infinite 0.2s",
        "typing-dot-3": "typing-dots 1s infinite 0.3s",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}