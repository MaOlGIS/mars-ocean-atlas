import type { NextConfig } from 'next';
const config: NextConfig = { output: "export", reactStrictMode: true, distDir: process.env.ATLAS_QA === "1" ? ".next-qa" : ".next", devIndicators: false };
export default config;
