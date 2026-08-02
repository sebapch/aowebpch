"use client";

import React from "react";

export function VitalBarsCanvas({
    hp,
    maxHp,
    mana,
    maxMana,
}: {
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
}) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const cssWidth = 156;
        const cssHeight = 70;
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);

        const context = canvas.getContext("2d");
        if (!context) {
            return;
        }

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, cssWidth, cssHeight);

        const drawBar = ({
            y,
            label,
            value,
            max,
            startColor,
            endColor,
        }: {
            y: number;
            label: string;
            value: number;
            max: number;
            startColor: string;
            endColor: string;
        }) => {
            const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

            context.font = "600 10px Inter, system-ui, sans-serif";
            context.textBaseline = "top";
            context.letterSpacing = "0.14em";
            context.fillStyle = "rgba(214, 211, 209, 0.8)";
            context.fillText(label.toUpperCase(), 0, y);

            context.letterSpacing = "0";
            context.font = "600 10px Inter, system-ui, sans-serif";
            context.fillStyle = "#f5f5f4";
            const valueLabel = `${value}/${max}`;
            const valueMetrics = context.measureText(valueLabel);
            context.fillText(valueLabel, cssWidth - valueMetrics.width, y);

            const barY = y + 14;
            const barHeight = 12;
            const barRadius = 6;
            const barWidth = cssWidth;

            context.fillStyle = "rgba(0, 0, 0, 0.35)";
            context.strokeStyle = "rgba(0, 0, 0, 0.35)";
            context.lineWidth = 1;
            context.beginPath();
            context.roundRect(
                0.5,
                barY + 0.5,
                barWidth - 1,
                barHeight - 1,
                barRadius,
            );
            context.fill();
            context.stroke();

            const innerX = 2;
            const innerY = barY + 2;
            const innerWidth = barWidth - 4;
            const innerHeight = barHeight - 4;
            context.fillStyle = "rgba(12, 10, 9, 0.85)";
            context.beginPath();
            context.roundRect(innerX, innerY, innerWidth, innerHeight, 4);
            context.fill();

            if (ratio <= 0) {
                return;
            }

            const fillWidth = Math.max(4, innerWidth * ratio);
            const gradient = context.createLinearGradient(
                0,
                innerY,
                fillWidth,
                innerY,
            );
            gradient.addColorStop(0, startColor);
            gradient.addColorStop(1, endColor);
            context.fillStyle = gradient;
            context.beginPath();
            context.roundRect(
                innerX,
                innerY,
                Math.min(innerWidth, fillWidth),
                innerHeight,
                4,
            );
            context.fill();
        };

        drawBar({
            y: 0,
            label: "Vida",
            value: hp,
            max: maxHp,
            startColor: "#951212",
            endColor: "#f06b34",
        });
        drawBar({
            y: 35,
            label: "Mana",
            value: mana,
            max: maxMana,
            startColor: "#0e436f",
            endColor: "#2fb8ed",
        });
    }, [hp, mana, maxHp, maxMana]);

    return (
        <canvas
            ref={canvasRef}
            width={156}
            height={70}
            className="block h-[70px] w-[156px] max-w-full"
            aria-hidden="true"
        />
    );
}
