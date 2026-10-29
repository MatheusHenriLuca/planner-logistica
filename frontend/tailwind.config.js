/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "status-normal": "#64748b",
        "status-critico": "#ef4444",
        "status-excluido": "#9ca3af",
        "status-travado": "#3b82f6",
      },
    },
  },
  plugins: [],
};
