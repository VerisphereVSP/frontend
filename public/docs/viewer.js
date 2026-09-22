// docs viewer logic — external file because the production CSP is script-src 'self' (no inline scripts)
    const params = new URLSearchParams(window.location.search);
    const file = params.get('file') || 'about.md';
    // Sanitize — only allow simple filenames
    const safe = file.replace(/[^a-zA-Z0-9._-]/g, '');
    fetch('/docs/' + safe)
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.text();
      })
      .then(md => {
        document.getElementById('content').innerHTML = marked.parse(md);
        // Set page title from first h1
        const h1 = document.querySelector('.content h1');
        if (h1) document.title = h1.textContent + ' — Verisphere';
      })
      .catch(() => {
        document.getElementById('content').innerHTML =
          '<p style="color:#ef4444;">Document not found.</p>';
      });
