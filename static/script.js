document.addEventListener("DOMContentLoaded", function () {
    var viewer = OpenSeadragon({
        id: "openseadragon",
        tileSources: {
            type: "image",
            url: "/view-fits/"
        },
        prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
        showNavigator: true,
        zoomPerScroll: 1.2,
        minZoomLevel: 1,
        defaultZoomLevel: 1,
        maxZoomLevel: 10
    });
});
