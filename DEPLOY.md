# Deploy PeakLog — GitHub + Vercel

Run these in PowerShell from the project folder. Node 24 already installed.

```powershell
cd "C:\Users\aoshe\Cowork\Health & Fitness\Health And Fitness\peaklog"
```

## 1. Push to GitHub

Using GitHub CLI (`gh`):

```powershell
git init
git add .
git commit -m "PeakLog v1: training, supplements and nutrition tracker"
gh repo create peaklog --public --source=. --remote=origin --push
```

No `gh`? Create an empty repo at https://github.com/new called `peaklog`, then:

```powershell
git init
git add .
git commit -m "PeakLog v1"
git branch -M main
git remote add origin https://github.com/<your-username>/peaklog.git
git push -u origin main
```

## 2. Deploy to Vercel (personal team)

```powershell
npm i -g vercel
vercel login
vercel --prod
```

At the prompts:
- Scope / team: **aoshenye-s-projects** (your personal team, same as Night Signal)
- Link to existing project: **No**, name it `peaklog`
- Framework preset: **Other**
- Build command: **(leave empty)**
- Output directory: **./**

You get a live URL like `https://peaklog.vercel.app`.

## 3. Auto-deploy on push (optional)

On vercel.com open the `peaklog` project, Settings, Git, and connect the GitHub repo. After that every `git push` to `main` redeploys automatically.

## Install on your phone

Open the Vercel URL in mobile Chrome/Safari, then Add to Home Screen. It installs as a standalone app and works offline.

## Moving data between devices

Phone and laptop store data separately (local-first). Use Data, Export JSON on one device and Data, Import JSON on the other to sync. Export weekly as a backup.
