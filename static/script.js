async function uploadFITS() {
    const fileInput = document.getElementById('fitsFile');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a FITS file.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch("/upload/", {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        plotFITS(result.data);
    } catch (error) {
        console.error("Error:", error);
    }
}

function plotFITS(data) {
    if (!data) {
        alert("No image data found in the FITS file.");
        return;
    }

    const plotData = [{
        z: data,
        type: 'heatmap',
        colorscale: 'Viridis'
    }];

    Plotly.newPlot('plot', plotData);
}
