// Memicu GitHub Actions (workflow build-apk.yml) di repo builder.
export async function dispatchBuild(inputs) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPO / GITHUB_TOKEN belum diisi di server.');

  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/build-apk.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'web2apk-web',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: process.env.GITHUB_BRANCH || 'main', inputs }),
  });
  if (r.status !== 204) {
    let m = '';
    try {
      m = (await r.json()).message;
    } catch {}
    throw new Error(`GitHub menolak permintaan build: ${m || r.status}`);
  }
}
