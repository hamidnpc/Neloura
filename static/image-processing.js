
// Define color maps
const COLOR_MAPS = {
    // Grayscale - simple linear gradient from black to white
    grayscale: (val) => {
        const v = val / 255;
        return [Math.round(255 * v), Math.round(255 * v), Math.round(255 * v)];
    },
    
    // Viridis - perceptually uniform colormap from dark blue to yellow
    viridis: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.25) {
            r = 68 + v * 4 * (33 - 68);
            g = 1 + v * 4 * (144 - 1);
            b = 84 + v * 4 * (140 - 84);
        } else if (v < 0.5) {
            r = 33 + (v - 0.25) * 4 * (94 - 33);
            g = 144 + (v - 0.25) * 4 * (201 - 144);
            b = 140 + (v - 0.25) * 4 * (120 - 140);
        } else if (v < 0.75) {
            r = 94 + (v - 0.5) * 4 * (190 - 94);
            g = 201 + (v - 0.5) * 4 * (222 - 201);
            b = 120 + (v - 0.5) * 4 * (47 - 120);
        } else {
            r = 190 + (v - 0.75) * 4 * (253 - 190);
            g = 222 + (v - 0.75) * 4 * (231 - 222);
            b = 47 + (v - 0.75) * 4 * (37 - 47);
        }
        
        return [Math.round(r), Math.round(g), Math.round(b)];
    },
    
    // Plasma - perceptually uniform colormap from dark purple to yellow
    plasma: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.25) {
            r = 13 + v * 4 * (75 - 13);
            g = 8 + v * 4 * (19 - 8);
            b = 135 + v * 4 * (193 - 135);
        } else if (v < 0.5) {
            r = 75 + (v - 0.25) * 4 * (133 - 75);
            g = 19 + (v - 0.25) * 4 * (57 - 19);
            b = 193 + (v - 0.25) * 4 * (187 - 193);
        } else if (v < 0.75) {
            r = 133 + (v - 0.5) * 4 * (208 - 133);
            g = 57 + (v - 0.5) * 4 * (164 - 57);
            b = 187 + (v - 0.5) * 4 * (114 - 187);
        } else {
            r = 208 + (v - 0.75) * 4 * (240 - 208);
            g = 164 + (v - 0.75) * 4 * (249 - 164);
            b = 114 + (v - 0.75) * 4 * (33 - 114);
        }
        
        return [Math.round(r), Math.round(g), Math.round(b)];
    },
    
    // Inferno - perceptually uniform colormap from black to yellow
    inferno: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.25) {
            r = 0 + v * 4 * (40 - 0);
            g = 0 + v * 4 * (11 - 0);
            b = 4 + v * 4 * (100 - 4);
        } else if (v < 0.5) {
            r = 40 + (v - 0.25) * 4 * (120 - 40);
            g = 11 + (v - 0.25) * 4 * (24 - 11);
            b = 100 + (v - 0.25) * 4 * (143 - 100);
        } else if (v < 0.75) {
            r = 120 + (v - 0.5) * 4 * (216 - 120);
            g = 24 + (v - 0.5) * 4 * (96 - 24);
            b = 143 + (v - 0.5) * 4 * (78 - 143);
        } else {
            r = 216 + (v - 0.75) * 4 * (252 - 216);
            g = 96 + (v - 0.75) * 4 * (167 - 96);
            b = 78 + (v - 0.75) * 4 * (6 - 78);
        }
        
        return [Math.round(r), Math.round(g), Math.round(b)];
    },
    
    // Magma - perceptually uniform colormap from black through purple to light yellow
    magma: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.25) {
            r = 0 + v * 4 * (45 - 0);
            g = 0 + v * 4 * (7 - 0);
            b = 4 + v * 4 * (90 - 4);
        } else if (v < 0.5) {
            r = 45 + (v - 0.25) * 4 * (126 - 45);
            g = 7 + (v - 0.25) * 4 * (33 - 7);
            b = 90 + (v - 0.25) * 4 * (168 - 90);
        } else if (v < 0.75) {
            r = 126 + (v - 0.5) * 4 * (212 - 126);
            g = 33 + (v - 0.5) * 4 * (115 - 33);
            b = 168 + (v - 0.5) * 4 * (200 - 168);
        } else {
            r = 212 + (v - 0.75) * 4 * (252 - 212);
            g = 115 + (v - 0.75) * 4 * (211 - 115);
            b = 200 + (v - 0.75) * 4 * (252 - 200);
        }
        
        return [Math.round(r), Math.round(g), Math.round(b)];
    },
    
    // Cividis - color vision deficiency friendly colormap
    cividis: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.25) {
            r = 0 + v * 4 * (32 - 0);
            g = 32 + v * 4 * (63 - 32);
            b = 77 + v * 4 * (111 - 77);
        } else if (v < 0.5) {
            r = 32 + (v - 0.25) * 4 * (88 - 32);
            g = 63 + (v - 0.25) * 4 * (117 - 63);
            b = 111 + (v - 0.25) * 4 * (113 - 111);
        } else if (v < 0.75) {
            r = 88 + (v - 0.5) * 4 * (175 - 88);
            g = 117 + (v - 0.5) * 4 * (184 - 117);
            b = 113 + (v - 0.5) * 4 * (77 - 113);
        } else {
            r = 175 + (v - 0.75) * 4 * (255 - 175);
            g = 184 + (v - 0.75) * 4 * (255 - 184);
            b = 77 + (v - 0.75) * 4 * (0 - 77);
        }
        
        return [Math.round(r), Math.round(g), Math.round(b)];
    },
    
    // Hot - black-red-yellow-white colormap
    hot: (val) => {
        const v = val / 255;
        
        // More accurate implementation
        const r = Math.min(255, Math.round(v * 3 * 255));
        const g = v <= 1/3 ? 0 : Math.min(255, Math.round((v - 1/3) * 3 * 255));
        const b = v <= 2/3 ? 0 : Math.min(255, Math.round((v - 2/3) * 3 * 255));
        
        return [r, g, b];
    },
    
    // Cool - cyan to magenta colormap
    cool: (val) => {
        const v = val / 255;
        
        // Correct implementation of cool colormap
        const r = Math.round(255 * (1 - v));
        const g = Math.round(255 * v);
        const b = 255;
        
        return [r, g, b];
    },
    
    // Rainbow - not perceptually uniform but popular
    rainbow: (val) => {
        const v = val / 255;
        
        // More accurate rainbow implementation using HSV color space conversion
        const h = (1 - v) * 240 / 360; // Hue from 240 (blue) to 0 (red)
        let r, g, b;
        
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const q = 1 - f;
        
        switch (i % 6) {
            case 0: r = 1; g = f; b = 0; break;
            case 1: r = q; g = 1; b = 0; break;
            case 2: r = 0; g = 1; b = f; break;
            case 3: r = 0; g = q; b = 1; break;
            case 4: r = f; g = 0; b = 1; break;
            case 5: r = 1; g = 0; b = q; break;
        }
        
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    },
    
    // Jet - MATLAB's traditional jet colormap
    jet: (val) => {
        const v = val / 255;
        
        // More accurate jet implementation with smoother transitions
        let r, g, b;
        
        if (v < 0.125) {
            r = 0;
            g = 0;
            b = 0.5 + v * 4;
        } else if (v < 0.375) {
            r = 0;
            g = (v - 0.125) * 4;
            b = 1;
        } else if (v < 0.625) {
            r = (v - 0.375) * 4;
            g = 1;
            b = 1 - (v - 0.375) * 4;
        } else if (v < 0.875) {
            r = 1;
            g = 1 - (v - 0.625) * 4;
            b = 0;
        } else {
            r = 1 - (v - 0.875) * 4;
            g = 0;
            b = 0;
        }
        
        // Add edge case handling to ensure we don't exceed [0,255] range
        return [
            Math.max(0, Math.min(255, Math.round(r * 255))),
            Math.max(0, Math.min(255, Math.round(g * 255))),
            Math.max(0, Math.min(255, Math.round(b * 255)))
        ];
    },
    
    // Added colormaps
    
    // Turbo - an improved version of jet with better perceptual properties
    turbo: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.125) {
            r = 0.18 + v * 8 * (0.07 - 0.18);
            g = 0.0 + v * 8 * (0.29 - 0.0);
            b = 0.39 + v * 8 * (0.80 - 0.39);
        } else if (v < 0.25) {
            r = 0.07 + (v - 0.125) * 8 * (0.02 - 0.07);
            g = 0.29 + (v - 0.125) * 8 * (0.59 - 0.29);
            b = 0.80 + (v - 0.125) * 8 * (0.90 - 0.80);
        } else if (v < 0.5) {
            r = 0.02 + (v - 0.25) * 4 * (0.22 - 0.02);
            g = 0.59 + (v - 0.25) * 4 * (0.89 - 0.59);
            b = 0.90 + (v - 0.25) * 4 * (0.77 - 0.90);
        } else if (v < 0.75) {
            r = 0.22 + (v - 0.5) * 4 * (0.70 - 0.22);
            g = 0.89 + (v - 0.5) * 4 * (0.67 - 0.89);
            b = 0.77 + (v - 0.5) * 4 * (0.22 - 0.77);
        } else {
            r = 0.70 + (v - 0.75) * 4 * (0.99 - 0.70);
            g = 0.67 + (v - 0.75) * 4 * (0.10 - 0.67);
            b = 0.22 + (v - 0.75) * 4 * (0.11 - 0.22);
        }
        
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    },
    
    // Parula - MATLAB's default colormap since 2014
    parula: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.25) {
            r = 0.20 + v * 4 * (0.22 - 0.20);
            g = 0.17 + v * 4 * (0.51 - 0.17);
            b = 0.58 + v * 4 * (0.78 - 0.58);
        } else if (v < 0.5) {
            r = 0.22 + (v - 0.25) * 4 * (0.13 - 0.22);
            g = 0.51 + (v - 0.25) * 4 * (0.73 - 0.51);
            b = 0.78 + (v - 0.25) * 4 * (0.70 - 0.78);
        } else if (v < 0.75) {
            r = 0.13 + (v - 0.5) * 4 * (0.47 - 0.13);
            g = 0.73 + (v - 0.5) * 4 * (0.86 - 0.73);
            b = 0.70 + (v - 0.5) * 4 * (0.41 - 0.70);
        } else {
            r = 0.47 + (v - 0.75) * 4 * (0.97 - 0.47);
            g = 0.86 + (v - 0.75) * 4 * (0.97 - 0.86);
            b = 0.41 + (v - 0.75) * 4 * (0.14 - 0.41);
        }
        
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    },
    
    // RdBu - diverging red-white-blue colormap for data with positive/negative values
    rdbu: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.5) {
            // Red to white
            const t = v * 2;
            r = 1.0;
            g = t;
            b = t;
        } else {
            // White to blue
            const t = (v - 0.5) * 2;
            r = 1.0 - t;
            g = 1.0 - t;
            b = 1.0;
        }
        
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    },
    
    // Spectral - diverging colormap with wider color range
    spectral: (val) => {
        const v = val / 255;
        let r, g, b;
        
        if (v < 0.2) {
            // Dark red to light red
            r = 0.6 + v * 5 * (0.9 - 0.6);
            g = 0.0 + v * 5 * (0.4 - 0.0);
            b = 0.0 + v * 5 * (0.0 - 0.0);
        } else if (v < 0.4) {
            // Light red to orange
            r = 0.9 + (v - 0.2) * 5 * (1.0 - 0.9);
            g = 0.4 + (v - 0.2) * 5 * (0.6 - 0.4);
            b = 0.0 + (v - 0.2) * 5 * (0.0 - 0.0);
        } else if (v < 0.6) {
            // Orange to yellow to light green
            r = 1.0 + (v - 0.4) * 5 * (0.8 - 1.0);
            g = 0.6 + (v - 0.4) * 5 * (0.9 - 0.6);
            b = 0.0 + (v - 0.4) * 5 * (0.4 - 0.0);
        } else if (v < 0.8) {
            // Light green to cyan
            r = 0.8 + (v - 0.6) * 5 * (0.4 - 0.8);
            g = 0.9 + (v - 0.6) * 5 * (0.8 - 0.9);
            b = 0.4 + (v - 0.6) * 5 * (0.7 - 0.4);
        } else {
            // Cyan to blue
            r = 0.4 + (v - 0.8) * 5 * (0.0 - 0.4);
            g = 0.8 + (v - 0.8) * 5 * (0.0 - 0.8);
            b = 0.7 + (v - 0.8) * 5 * (0.6 - 0.7);
        }
        
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
};

// Define scaling functions
const SCALING_FUNCTIONS = {
    // Linear scaling (default)
    linear: (val, min, max) => {
        return (val - min) / (max - min);
    },
    
    // Logarithmic scaling
    logarithmic: (val, min, max) => {
        // Ensure we don't take log of zero or negative numbers
        const minPositive = Math.max(min, 1e-10);
        const adjustedVal = Math.max(val, minPositive);
        const logMin = Math.log(minPositive);
        const logMax = Math.log(max);
        
        return (Math.log(adjustedVal) - logMin) / (logMax - logMin);
    },
    
    // Square root scaling
    sqrt: (val, min, max) => {
        const normalized = (val - min) / (max - min);
        return Math.sqrt(Math.max(0, normalized));
    },
    
    // Power scaling (squared)
    power: (val, min, max) => {
        const normalized = (val - min) / (max - min);
        return Math.pow(Math.max(0, normalized), 2);
    },
    
    // Asinh scaling (good for astronomical data with large dynamic range)
    asinh: (val, min, max) => {
        const normalized = (val - min) / (max - min);
        const factor = 3; // Adjustable parameter for asinh scaling
        return Math.asinh(factor * normalized) / Math.asinh(factor);
    }
};

