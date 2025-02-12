async function listFiles() {
    const response = await fetch("/list-files/");
    const data = await response.json();

    const fileList = document.getElementById("fileList");
    fileList.innerHTML = ""; // Clear previous list

    data.files.forEach(file => {
        const listItem = document.createElement("li");
        listItem.innerHTML = `<a href="https://drive.google.com/file/d/${file.id}" target="_blank">${file.name}</a>`;
        fileList.appendChild(listItem);
    });
}

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a file to upload.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/upload/", {
        method: "POST",
        body: formData
    });

    const result = await response.json();
    alert(result.message);
    listFiles(); // Refresh file list after upload
}
