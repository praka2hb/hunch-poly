/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,jsx,ts,tsx}",
        "./components/**/*.{js,jsx,ts,tsx}",
    ],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                // App theme colors
                app: {
                    bg: '#FFFFFF',
                    card: '#FAFAFA',
                    elevated: '#F5F5F5',
                    dark: '#000000',
                },
                border: {
                    DEFAULT: '#E5E5E5',
                    light: '#F0F0F0',
                    dark: '#D0D0D0',
                },
                txt: {
                    primary: '#000000',
                    secondary: '#666666',
                    disabled: '#999999',
                    inverse: '#FFFFFF',
                },
                status: {
                    success: '#00e003',
                    error: '#FF10F0',
                    warning: '#666666',
                },
                chart: {
                    positive: '#00e003',
                    negative: '#FF6B9D',
                    neutral: '#00e003',
                    line: '#00e003',
                    dot: '#00e003',
                },
            },
        },
    },
    plugins: [],
}
