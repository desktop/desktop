export function updateDocumentTitle(title: string) {
  document.title = title
  const srTitle = document.getElementById('sr-title')
  if (srTitle) {
    srTitle.innerHTML = title
  }
}
