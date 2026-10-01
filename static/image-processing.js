// NEW: Global COLOR_MAPS object
const COLOR_MAPS = {
    // Grayscale - simple linear gradient from black to white
    grayscale: (val) => {
        return [val, val, val];
    },
    
    // Viridis - perceptually uniform colormap
    viridis: (val) => {
        const v = val / 255;
        let r, g, b;
        if (v < 0.25) {
            r = 68 + v * 4 * (33 - 68); g = 1 + v * 4 * (144 - 1); b = 84 + v * 4 * (140 - 84);
        } else if (v < 0.5) {
            r = 33 + (v - 0.25) * 4 * (94 - 33); g = 144 + (v - 0.25) * 4 * (201 - 144); b = 140 + (v - 0.25) * 4 * (120 - 140);
        } else if (v < 0.75) {
            r = 94 + (v - 0.5) * 4 * (190 - 94); g = 201 + (v - 0.5) * 4 * (222 - 201); b = 120 + (v - 0.5) * 4 * (47 - 120);
        } else {
            r = 190 + (v - 0.75) * 4 * (253 - 190); g = 222 + (v - 0.75) * 4 * (231 - 222); b = 47 + (v - 0.75) * 4 * (37 - 47);
        }
        return [Math.round(r), Math.round(g), Math.round(b)];
    },
    
    // Plasma - another perceptually uniform colormap
    plasma: (val) => {
        const v = val / 255;
        let r, g, b;
        if (v < 0.25) {
            r = 13 + v * 4 * (126 - 13); g = 8 + v * 4 * (8 - 8); b = 135 + v * 4 * (161 - 135);
        } else if (v < 0.5) {
            r = 126 + (v - 0.25) * 4 * (203 - 126); g = 8 + (v - 0.25) * 4 * (65 - 8); b = 161 + (v - 0.25) * 4 * (107 - 161);
        } else if (v < 0.75) {
            r = 203 + (v - 0.5) * 4 * (248 - 203); g = 65 + (v - 0.5) * 4 * (150 - 65); b = 107 + (v - 0.5) * 4 * (58 - 107);
        } else {
            r = 248 + (v - 0.75) * 4 * (239 - 248); g = 150 + (v - 0.75) * 4 * (204 - 150); b = 58 + (v - 0.75) * 4 * (42 - 58);
        }
        return [Math.round(r), Math.round(g), Math.round(b)];
    },
    
    // Inferno
    inferno: (val) => {
        const v = val / 255;
        let r, g, b;
        if (v < 0.2) { r = 0 + v * 5 * 50; g = 0 + v * 5 * 10; b = 4 + v * 5 * 90; }
        else if (v < 0.4) { r = 50 + (v-0.2)*5 * (120-50); g = 10 + (v-0.2)*5 * (28-10); b = 94 + (v-0.2)*5 * (109-94); }
        else if (v < 0.6) { r = 120 + (v-0.4)*5 * (187-120); g = 28 + (v-0.4)*5 * (55-28); b = 109 + (v-0.4)*5 * (84-109); }
        else if (v < 0.8) { r = 187 + (v-0.6)*5 * (236-187); g = 55 + (v-0.6)*5 * (104-55); b = 84 + (v-0.6)*5 * (36-84); }
        else { r = 236 + (v-0.8)*5 * (251-236); g = 104 + (v-0.8)*5 * (180-104); b = 36 + (v-0.8)*5 * (26-36); }
        return [Math.round(r), Math.round(g), Math.round(b)];
    },

    // Cividis
    cividis: (val) => {
        const v = val / 255;
        let r, g, b;
        if (v < 0.2) { r = 0 + v*5 * 33; g = 32 + v*5 * (61-32); b = 76 + v*5 * (107-76); }
        else if (v < 0.4) { r = 33 + (v-0.2)*5 * (85-33); g = 61 + (v-0.2)*5 * (91-61); b = 107 + (v-0.2)*5 * (108-107); }
        else if (v < 0.6) { r = 85 + (v-0.4)*5 * (123-85); g = 91 + (v-0.4)*5 * (122-91); b = 108 + (v-0.4)*5 * (119-108); }
        else if (v < 0.8) { r = 123 + (v-0.6)*5 * (165-123); g = 122 + (v-0.6)*5 * (156-122); b = 119 + (v-0.6)*5 * (116-119); }
        else { r = 165 + (v-0.8)*5 * (217-165); g = 156 + (v-0.8)*5 * (213-156); b = 116 + (v-0.8)*5 * (122-116); }
        return [Math.round(r), Math.round(g), Math.round(b)];
    },

    // Hot - classic heat map
    hot: (val) => {
        const v = val / 255;
        let r, g, b;
        if (v < 1/3) { r = v * 3 * 255; g = 0; b = 0; }
        else if (v < 2/3) { r = 255; g = (v - 1/3) * 3 * 255; b = 0; }
        else { r = 255; g = 255; b = (v - 2/3) * 3 * 255; }
        return [Math.round(r), Math.round(g), Math.round(b)];
    },

    // Cool
    cool: (val) => {
        const v = val / 255;
        const r = v * 255;
        const g = (1 - v) * 255;
        const b = 255;
        return [Math.round(r), Math.round(g), Math.round(b)];
    },

    // Rainbow colormap
    rainbow: (val) => {
        const v = val / 255;
        const a = (1 - v) * 4; // 0-4
        const X = Math.floor(a);
        const Y = a - X;
        let r, g, b;
        switch(X) {
            case 0: r = 1.0; g = Y; b = 0.0; break;
            case 1: r = 1.0 - Y; g = 1.0; b = 0.0; break;
            case 2: r = 0.0; g = 1.0; b = Y; break;
            case 3: r = 0.0; g = 1.0 - Y; b = 1.0; break;
            case 4: r = 0.0; g = 0.0; b = 1.0; break;
            default: r=0; g=0; b=0; break;
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    },

    // Jet colormap
    jet: (val) => {
        const v = val / 255;
        let r = 0, g = 0, b = 0;
        if (v < 0.125) { b = 0.5 + 4 * v; } // 0.5 - 1.0
        else if (v < 0.375) { g = 4 * (v - 0.125); b = 1.0; } // 0.0 - 1.0
        else if (v < 0.625) { r = 4 * (v - 0.375); g = 1.0; b = 1.0 - 4 * (v - 0.375); } // 0.0 - 1.0, 1.0 - 0.0
        else if (v < 0.875) { r = 1.0; g = 1.0 - 4 * (v - 0.625); } // 1.0 - 0.0
        else { r = 1.0 - 4 * (v - 0.875); } // 1.0 - 0.5
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
};

// NEW: Global SCALING_FUNCTIONS object
const SCALING_FUNCTIONS = {
    linear: (val, min, max) => {
        if (min === max) return 0.5;
        return (val - min) / (max - min);
    },
    logarithmic: (val, min, max) => {
        const minPositive = Math.max(min, 1e-10);
        const adjustedVal = Math.max(val, minPositive);
        const logMin = Math.log(minPositive);
        const logMax = Math.log(max);
        if (logMin === logMax) return 0.5;
        return (Math.log(adjustedVal) - logMin) / (logMax - logMin);
    },
    sqrt: (val, min, max) => {
        if (min === max) return 0.5;
        const normalized = (val - min) / (max - min);
        return Math.sqrt(Math.max(0, normalized));
    },
    power: (val, min, max) => {
        if (min === max) return 0.5;
        const normalized = (val - min) / (max - min);
        return Math.pow(Math.max(0, normalized), 2);
    },
    asinh: (val, min, max) => {
        if (min === max) return 0.5;
        const normalized = 2 * ((val - min) / (max - min)) - 1;
        const scaled = (Math.asinh(normalized * 3) / Math.asinh(3) + 1) / 2;
        return Math.max(0, Math.min(1, scaled));
    }
};