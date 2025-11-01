/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#282828",
        secondary: "#121212",
        accent: "#e68019",
        background: "#FFFFFF",
        "background-alt": "#F3F3F3",
        "background-warm": "#F5F3F0",
        text: "#282828",
        "text-muted": "#666666",
        border: "rgba(40, 40, 40, 0.15)",
      },
      fontFamily: {
        display: ["Atak", "sans-serif"],
        body: ["Atak", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0px",
        none: "0px",
        sm: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        full: "9999px",
      },
      spacing: {
        'desktop-y': '16px',
        'desktop-x': '24px',
        'mobile-y': '8px',
        'mobile-x': '12px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
