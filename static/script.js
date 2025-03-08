var viewer;

document.addEventListener("DOMContentLoaded", function () {
    viewer = OpenSeadragon({
        id: "openseadragon",
        tileSources: {
            type: "image",
            url: "/view-fits/"
        },
        prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
        showNavigator: false,   // Hide mini-map
        showZoomControl: false, // Hide built-in zoom
        showHomeControl: false, // Hide built-in reset
        showFullPageControl: false, // Hide built-in fullscreen
        showRotationControl: false, // Hide rotation
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
