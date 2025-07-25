// This script will run after the HTML document has been fully loaded and parsed.
document.addEventListener('DOMContentLoaded', () => {
    // --- DATA AND CONFIGURATION ---
    // Initial default values for all input parameters.
    const initialInputs = [
        { id: 'V_final_cc', label: 'Final Volume (V_final_cc)', value: 6, unit: 'cc' },
        { id: 'fi0', label: 'Initial Inner Angle (fi0)', value: 0, unit: 'rad' },
        { id: 'fo0', label: 'Initial Outer Angle (fo0)', value: -1.39626, unit: 'rad' },
        { id: 'fie', label: 'End Inner Angle (fie)', value: 17.7195, unit: 'rad' },
        { id: 'foe', label: 'End Outer Angle (foe)', value: 17.7195, unit: 'rad' },
        { id: 'fis', label: 'Inner Starting Angle (fis)', value: 3.14159, unit: 'rad' },
        { id: 'fos', label: 'Outer Starting Angle (fos)', value: 0.296706, unit: 'rad' },
        { id: 'ts_h_ratio', label: 'Thickness/Height Ratio', value: 0.25, unit: '-' },
        { id: 'rb_min', label: 'Min Base Radius (rb_min)', value: 0.0001, unit: 'm' },
        { id: 'rb_max', label: 'Max Base Radius (rb_max)', value: 0.004, unit: 'm' },
        { id: 'rb_step', label: 'Base Radius Step (rb_step)', value: 1e-7, unit: 'm' },
        { id: 'P', label: 'Pressure on Walls (P)', value: 1.8, unit: 'N/mm²' },
        { id: 'E', label: 'Young\'s Modulus (E)', value: 73000, unit: 'N/mm²' },
        { id: 'Ys', label: 'Yield Strength (Ys)', value: 280, unit: 'N/mm²' },
    ];

    // --- DYNAMIC INPUT FORM CREATION ---
    const inputForm = document.getElementById('input-form');
    // Loop through the initial inputs to create the form fields dynamically.
    initialInputs.forEach(input => {
        const group = document.createElement('div');
        group.className = 'input-group'; // This class is defined in style.css
        group.innerHTML = `
            <label for="${input.id}">${input.label} <span class="text-gray-400">(${input.unit})</span></label>
            <input type="number" id="${input.id}" value="${input.value}" step="any">
        `;
        inputForm.appendChild(group);
    });

    // --- DOM ELEMENT REFERENCES ---
    const runButton = document.getElementById('run-calculation');
    const outputSection = document.getElementById('output-section');
    const welcomeMessage = document.getElementById('welcome-message');
    const outputStep1 = document.getElementById('output-step1');
    const outputStep4 = document.getElementById('output-step4');
    const downloadFixedDxf = document.getElementById('download-fixed-dxf');
    const downloadOrbitingDxf = document.getElementById('download-orbiting-dxf');

    // --- MAIN EVENT LISTENER ---
    // This function is triggered when the "Run" button is clicked.
    runButton.addEventListener('click', () => {
        runButton.textContent = 'Calculating...';
        runButton.disabled = true;

        // Use a short timeout to allow the UI to update before the heavy calculation starts.
        setTimeout(() => {
            try {
                // 1. Get current values from the form
                const inputs = getInputs();
                // 2. Run calculations in sequence, passing results from one to the next.
                const results1 = calculateStep1(inputs);
                const allInputs = { ...inputs, ...results1 };
                
                const results2 = calculateStep2(allInputs);
                const finalInputs = { ...allInputs, ...results2 };
                
                const results4 = calculateStep4(finalInputs);
                const geometry = calculateGeometry(finalInputs);

                // 3. Display all results on the page.
                displayResults(results1, results2, results4, geometry);
                
                // 4. Show the output section and hide the welcome message.
                welcomeMessage.style.display = 'none';
                outputSection.style.display = 'block';

            } catch (e) {
                alert('An error occurred during calculation: ' + e.message);
                console.error(e);
            } finally {
                // Reset the button state.
                runButton.textContent = 'Run Full Calculation';
                runButton.disabled = false;
            }
        }, 50);
    });

    // --- CALCULATION FUNCTIONS (Translated from Python scripts) ---

    /**
     * Reads all values from the input fields in the form.
     * @returns {object} An object containing all input values, parsed as floats.
     */
    function getInputs() {
        const inputs = {};
        initialInputs.forEach(i => {
            inputs[i.id] = parseFloat(document.getElementById(i.id).value);
        });
        return inputs;
    }

    /**
     * Step 1: Iteratively finds the best-fit scroll dimensions based on desired volume.
     * @param {object} inputs - The user-provided inputs.
     * @returns {object} The calculated final dimensions (rb, ts, h, ro) in mm.
     */
    function calculateStep1(inputs) {
        const { V_final_cc, fi0, fo0, fie, foe, ts_h_ratio, rb_min, rb_max, rb_step } = inputs;
        const V_disp_desired_cc = V_final_cc / 2;
        
        let bestMatch = { error: Infinity };

        // Loop through a range of base radius values to find the one that produces the closest volume.
        for (let rb = rb_min; rb < rb_max; rb += rb_step) {
            const ts_m = rb * (fi0 - fo0);
            const h_m = ts_m / ts_h_ratio;
            const ro_m = rb * Math.PI - ts_m;
            const V_disp_m3 = -Math.PI * h_m * rb * ro_m * (3 * Math.PI - 2 * fie + fi0 + fo0);
            const V_disp_cc = V_disp_m3 * 1e6;
            
            const error = Math.abs(V_disp_cc - V_disp_desired_cc);

            if (error < bestMatch.error) {
                bestMatch = {
                    error,
                    rb_final: rb * 1000, // convert to mm for output
                    ts_final: ts_m * 1000,
                    h_final: h_m * 1000,
                    ro_final: ro_m * 1000,
                    V_disp_cc_final: V_disp_cc
                };
            }

            // If a very close solution is found, exit early.
            if (error < 1e-3) {
                break; 
            }
        }
        return bestMatch;
    }

    /**
     * Step 2: Calculates further geometric parameters based on the results of Step 1.
     * @param {object} inputs - All inputs, including results from calculateStep1.
     * @returns {object} Calculated radii and coordinates for arc centers.
     */
    function calculateStep2(inputs) {
        const { rb_final, ro_final, fis, fos } = inputs;
        const rb = rb_final / 1000; // convert to m for calculation
        const r0 = ro_final / 1000;

        const cos_phi_is = Math.cos(fis);
        const sin_phi_is = Math.sin(fis);
        const cos_phi_os = Math.cos(fos);
        const sin_phi_os = Math.sin(fos);

        const x_fis_m = rb * (cos_phi_is + fis * sin_phi_is);
        const y_fis_m = rb * (sin_phi_is - fis * cos_phi_is);
        const x_f0s_m = rb * (cos_phi_os + (fos + 1.39626) * sin_phi_os);
        const y_f0s_m = rb * (sin_phi_os - (fos + 1.39626) * cos_phi_os);

        const delta_x = x_fis_m - x_f0s_m;
        const delta_y = y_fis_m - y_f0s_m;

        const wa = Math.cos(fos - fis) + 1;
        const wb = r0 * wa - delta_x * (sin_phi_os - sin_phi_is) + delta_y * (cos_phi_os - cos_phi_is);
        const wc = r0 * (delta_x * sin_phi_is - delta_y * cos_phi_is) - ((delta_y**2 + delta_x**2) / 2);
        
        const sqrt_term = wb**2 - 4 * wa * wc;
        if (sqrt_term < 0) throw new Error("Negative square root in r_a2_max calculation. Check input angles.");

        const r_a2_max_m = (-wb + Math.sqrt(sqrt_term)) / (2 * wa);
        
        const numerator = 0.5 * (delta_x**2 + delta_y**2) + r_a2_max_m * (delta_x * sin_phi_os - delta_y * cos_phi_os);
        const denominator = r_a2_max_m * (Math.cos(fos - fis) + 1) + delta_x * sin_phi_is - delta_y * cos_phi_is;
        const r_a1_m = numerator / denominator;
        
        const x_a1_m = x_fis_m - Math.sin(fis) * r_a1_m;
        const y_a1_m = y_fis_m + Math.cos(fis) * r_a1_m;
        const x_a2_m = x_f0s_m - Math.sin(fos) * r_a2_max_m;
        const y_a2_m = y_f0s_m + Math.cos(fos) * r_a2_max_m;

        // Convert all results to mm for consistency.
        return {
            r_a1: r_a1_m * 1000,
            r_a2_max: r_a2_max_m * 1000,
            x_a1: x_a1_m * 1000,
            y_a1: y_a1_m * 1000,
            x_a2: x_a2_m * 1000,
            y_a2: y_a2_m * 1000,
        };
    }
    
    /**
     * Step 4 (FOS): Performs a Factor of Safety analysis.
     * @param {object} inputs - All inputs, including results from previous steps.
     * @returns {object} The safety status and related FOS values.
     */
    function calculateStep4(inputs) {
        const { P, ts_final, h_final, E, Ys } = inputs;
        const FOS_list = Array.from({length: 8}, (_, i) => 1.5 + i * 0.1);

        for (const FOS of FOS_list) {
            const sigma_allowable = Ys / FOS;
            const max_allowable_pressure = (sigma_allowable * ts_final**2) / (3 * h_final**2);
            
            if (max_allowable_pressure >= P) {
                const max_deflection = (3 * P * h_final**4) / (2 * E * ts_final**3);
                return {
                    status: 'SAFE',
                    FOS: FOS.toFixed(1),
                    max_allowable_pressure: max_allowable_pressure.toFixed(4),
                    max_deflection: max_deflection.toFixed(4),
                };
            }
        }
        
        return { status: 'FAIL', message: 'Beam may fail for all tested FOS values (1.5-2.2).' };
    }

    /**
     * Step 3 & 5 (Geometry): Calculates the detailed points for the fixed and orbiting scroll geometries.
     * @param {object} inputs - All available input data.
     * @returns {object} An object containing arrays of points for both fixed and orbiting scrolls.
     */
    function calculateGeometry(inputs) {
        const { r_a1, r_a2_max, x_a1, y_a1, x_a2, y_a2, rb_final, fi0, fo0, ro_final, fie } = inputs;
        
        // Convert inputs from mm to meters for calculation
        const ra1_m = r_a1 / 1000, ra2_m = r_a2_max / 1000;
        const xa1_m = x_a1 / 1000, ya1_m = y_a1 / 1000;
        const xa2_m = x_a2 / 1000, ya2_m = y_a2 / 1000;
        const rb_m = rb_final / 1000;

        // --- Fixed Scroll Geometry Calculation ---
        const dx = xa2_m - xa1_m;
        const dy = ya2_m - ya1_m;
        const d = Math.hypot(dx, dy);
        if (d === 0 || (ra1_m + ra2_m) > d) throw new Error("Invalid arc geometry for fixed scroll.");

        const alpha = Math.atan2(dy, dx);
        const beta = Math.acos((ra1_m + ra2_m) / d);
        const theta1 = beta + alpha;
        const L = Math.sqrt(d**2 - (ra1_m + ra2_m)**2);

        const xa1_t = xa1_m + ra1_m * Math.cos(theta1);
        const ya1_t = ya1_m + ra1_m * Math.sin(theta1);
        const xa2_t = xa1_t + L * Math.sin(theta1);
        const ya2_t = ya1_t - L * Math.cos(theta1);

        const angles = Array.from({length: 1000}, (_, i) => i * 17.7195 / 999);
        
        const x1 = angles.map(a => rb_m * (Math.cos(a) + (a - fi0) * Math.sin(a)));
        const y1 = angles.map(a => rb_m * (Math.sin(a) - (a - fi0) * Math.cos(a)));
        const x2 = angles.map(a => rb_m * (Math.cos(a) + (a - fo0) * Math.sin(a)));
        const y2 = angles.map(a => rb_m * (Math.sin(a) - (a - fo0) * Math.cos(a)));

        let idx_tan1 = 0, minDist1 = Infinity;
        x1.forEach((x, i) => {
            const dist = Math.abs(Math.hypot(x - xa1_m, y1[i] - ya1_m) - ra1_m);
            if (dist < minDist1) { minDist1 = dist; idx_tan1 = i; }
        });
        const x1_trim = x1.slice(idx_tan1), y1_trim = y1.slice(idx_tan1);

        let idx_tan2 = 0, minDist2 = Infinity;
        x2.forEach((x, i) => {
            const dist = Math.abs(Math.hypot(x - xa2_m, y2[i] - ya2_m) - ra2_m);
            if (dist < minDist2) { minDist2 = dist; idx_tan2 = i; }
        });
        const x2_trim = x2.slice(idx_tan2), y2_trim = y2.slice(idx_tan2);

        const theta_P1 = Math.atan2(ya1_t - ya1_m, xa1_t - xa1_m);
        let theta_inv1 = Math.atan2(y1_trim[0] - ya1_m, x1_trim[0] - xa1_m);
        if (theta_inv1 <= theta_P1) theta_inv1 += 2 * Math.PI;
        const theta_arc1 = Array.from({length: 600}, (_, i) => theta_P1 + i * (theta_inv1 - theta_P1) / 599);
        const x_arc1 = theta_arc1.map(a => xa1_m + ra1_m * Math.cos(a));
        const y_arc1 = theta_arc1.map(a => ya1_m + ra1_m * Math.sin(a));

        const theta_P2 = Math.atan2(ya2_t - ya2_m, xa2_t - xa2_m);
        let theta_inv2 = Math.atan2(y2_trim[0] - ya2_m, x2_trim[0] - xa2_m);
        if (theta_inv2 <= theta_P2) theta_inv2 += 2 * Math.PI;
        const theta_arc2 = Array.from({length: 300}, (_, i) => theta_P2 + i * (theta_inv2 - theta_P2) / 299);
        const x_arc2 = theta_arc2.map(a => xa2_m + ra2_m * Math.cos(a));
        const y_arc2 = theta_arc2.map(a => ya2_m + ra2_m * Math.sin(a));

        const fixed_scroll = {
            arc1: { x: x_arc1, y: y_arc1 }, arc2: { x: x_arc2, y: y_arc2 },
            inv1: { x: x1_trim, y: y1_trim }, inv2: { x: x2_trim, y: y2_trim },
            line: { x: [xa1_t, xa2_t], y: [ya1_t, ya2_t] }
        };

        // --- Orbiting Scroll Transformation ---
        const ro_m = ro_final / 1000;
        const crank_angle_theta = 0.0;
        const Theta = fie - crank_angle_theta - Math.PI / 2;

        const transform = (x, y) => ({
            x_orb: -x + ro_m * Math.cos(Theta),
            y_orb: -y + ro_m * Math.sin(Theta)
        });

        const orbiting_scroll = {};
        for (const key in fixed_scroll) {
            const transformed_x = [], transformed_y = [];
            for (let i = 0; i < fixed_scroll[key].x.length; i++) {
                const { x_orb, y_orb } = transform(fixed_scroll[key].x[i], fixed_scroll[key].y[i]);
                transformed_x.push(x_orb);
                transformed_y.push(y_orb);
            }
            orbiting_scroll[key] = { x: transformed_x, y: transformed_y };
        }
        
        // Convert all final coordinates to mm for drawing and export
        const to_mm = (obj) => {
            const newObj = {};
            for (const key in obj) {
                newObj[key] = {
                    x: obj[key].x.map(v => v * 1000),
                    y: obj[key].y.map(v => v * 1000)
                };
            }
            return newObj;
        };

        return { fixed: to_mm(fixed_scroll), orbiting: to_mm(orbiting_scroll) };
    }

    // --- DISPLAY AND DRAWING FUNCTIONS ---

    /**
     * Updates the DOM with all the calculated results.
     */
    function displayResults(res1, res2, res4, geometry) {
        const createOutputItem = (label, value, unit) => `<div class="output-item"><span>${label}</span><span>${value} ${unit}</span></div>`;
        
        outputStep1.innerHTML = createOutputItem('Base Radius (rb)', res1.rb_final.toFixed(4), 'mm')
            + createOutputItem('Wall Thickness (ts)', res1.ts_final.toFixed(4), 'mm')
            + createOutputItem('Scroll Height (h)', res1.h_final.toFixed(4), 'mm')
            + createOutputItem('Orbiting Radius (ro)', res1.ro_final.toFixed(4), 'mm')
            + createOutputItem('Radius A1 (r_a1)', res2.r_a1.toFixed(4), 'mm')
            + createOutputItem('Max Radius A2 (r_a2_max)', res2.r_a2_max.toFixed(4), 'mm');

        if (res4.status === 'SAFE') {
            outputStep4.innerHTML = `<div class="p-4 bg-green-50 border-l-4 border-green-500 text-green-800">
                <p class="font-bold">System is SAFE</p>
                <p>Safe FOS: ${res4.FOS}</p>
                <p>Max Allowable Pressure: ${res4.max_allowable_pressure} N/mm²</p>
                <p>Calculated Max Deflection: ${res4.max_deflection} mm</p>
            </div>`;
        } else {
            outputStep4.innerHTML = `<div class="p-4 bg-red-50 border-l-4 border-red-500 text-red-800">
                <p class="font-bold">System may FAIL</p>
                <p>${res4.message}</p>
            </div>`;
        }
        
        drawScroll('fixed-scroll-canvas', geometry.fixed, 'darkblue');
        drawScroll('orbiting-scroll-canvas', geometry.orbiting, 'crimson');

        const fixedDxfContent = generateDxf(geometry.fixed);
        setupDownload(downloadFixedDxf, 'fixed_scroll.dxf', fixedDxfContent);

        const orbitingDxfContent = generateDxf(geometry.orbiting);
        setupDownload(downloadOrbitingDxf, 'orbiting_scroll.dxf', orbitingDxfContent);
    }
    
    /**
     * Draws a scroll geometry onto a specified canvas.
     * @param {string} canvasId - The ID of the canvas element.
     * @param {object} geometry - The geometry object with point arrays.
     * @param {string} color - The color to use for drawing.
     */
    function drawScroll(canvasId, geometry, color) {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        // Find data bounds to scale and center the drawing.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        Object.values(geometry).forEach(part => {
            part.x.forEach(x => { if (x < minX) minX = x; if (x > maxX) maxX = x; });
            part.y.forEach(y => { if (y < minY) minY = y; if (y > maxY) maxY = y; });
        });

        const dataWidth = maxX - minX;
        const dataHeight = maxY - minY;
        const scale = Math.min(width * 0.9 / dataWidth, height * 0.9 / dataHeight);
        
        const offsetX = (width - dataWidth * scale) / 2 - minX * scale;
        const offsetY = (height - dataHeight * scale) / 2 - minY * scale;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        // Draw each part of the geometry as a continuous line.
        Object.values(geometry).forEach(part => {
            ctx.moveTo(part.x[0] * scale + offsetX, height - (part.y[0] * scale + offsetY));
            for (let i = 1; i < part.x.length; i++) {
                ctx.lineTo(part.x[i] * scale + offsetX, height - (part.y[i] * scale + offsetY));
            }
        });
        ctx.stroke();
    }

    // --- DXF AND DOWNLOAD UTILITIES ---

    /**
     * Generates a string containing the geometry in DXF format.
     * @param {object} geometry - The geometry object to export.
     * @returns {string} The DXF file content as a string.
     */
    function generateDxf(geometry) {
        let dxf = `0\nSECTION\n2\nENTITIES\n`;
        
        const addPolyline = (points) => {
            dxf += `0\nLWPOLYLINE\n100\nAcDbEntity\n100\nAcDbPolyline\n90\n${points.length}\n70\n0\n`;
            points.forEach(p => {
                dxf += `10\n${p.x.toFixed(6)}\n20\n${p.y.toFixed(6)}\n`;
            });
        };
        
        Object.values(geometry).forEach(part => {
            const points = part.x.map((x, i) => ({ x, y: part.y[i] }));
            addPolyline(points);
        });

        dxf += `0\nENDSEC\n0\nEOF\n`;
        return dxf;
    }
    
    /**
     * Configures a download link for a file.
     * @param {HTMLElement} linkElement - The <a> tag to configure.
     * @param {string} filename - The desired name for the downloaded file.
     * @param {string} content - The text content of the file.
     */
    function setupDownload(linkElement, filename, content) {
        const blob = new Blob([content], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        linkElement.href = url;
        linkElement.download = filename;
        // Clean up the object URL after the download link is clicked.
        linkElement.onclick = () => {
            setTimeout(() => URL.revokeObjectURL(url), 100);
        };
    }
});
