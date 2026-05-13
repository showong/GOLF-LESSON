import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        fairway: {
          50: "#f1f8f1",
          100: "#dceddd",
          500: "#3f8a4f",
          600: "#2f6b3c",
          700: "#245530",
          900: "#13311c",
        },
        sand: {
          100: "#fdf6e3",
          300: "#f0d9a8",
          500: "#d6a85f",
        },
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
