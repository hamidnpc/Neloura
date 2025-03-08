var viewer;

// Initialize OpenSeadragon on page load
document.addEventListener("DOMContentLoaded", function () {
    viewer = OpenSeadragon({
        id: "openseadragon",
        tileSources: {
            type: "image",
            url: "/view-fits/"
        },
        prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
        showRotationControl: true,
        defaultZoomLevel: 1,
        minZoomLevel: 0.5,
        maxZoomLevel: 10,
        zoomPerScroll: 1.2
    });

    // Add keyboard shortcuts
    document.addEventListener("keydown", function (event) {
        if (event.key === "+") {
            zoomIn();
        } else if (event.key === "-") {
            zoomOut();
        } else if (event.key.toLowerCase() === "r") {
            resetView();
        }
    });
});

// ✅ Define functions in the global scope so they work with `onclick` attributes
function zoomIn() {
    if (viewer) {
        viewer.viewport.zoomBy(1.2);
        viewer.viewport.applyConstraints();
    }
}

function zoomOut() {
    if (viewer) {
        viewer.viewport.zoomBy(0.8);
        viewer.viewport.applyConstraints();
    }
}

function resetView() {
    if (viewer) {
        viewer.viewport.goHome();
    }
}
