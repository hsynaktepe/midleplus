import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 20, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        <linearGradient id="midleLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#66c0f4" />
          <stop offset="100%" stopColor="#1999ff" />
        </linearGradient>
      </defs>

      {/* Arka plan kartı (Hafif açılı minimalist kart silüeti) */}
      <rect
        x="7.5"
        y="2.5"
        width="12"
        height="16"
        rx="2"
        transform="rotate(12 13.5 10.5)"
        fill="#1e2c3d"
        stroke="#2a475e"
        strokeWidth="1.2"
      />

      {/* Ön plan koleksiyon kartı */}
      <rect
        x="3"
        y="4"
        width="13"
        height="17"
        rx="2"
        fill="#171d25"
        stroke="url(#midleLogoGrad)"
        strokeWidth="1.5"
      />

      {/* Kartın ortasındaki sade "+" (Plus) sembolü */}
      <path
        d="M9.5 9.5V15.5M6.5 12.5H12.5"
        stroke="url(#midleLogoGrad)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
};
