HOW TO TAKE RED (FAIL) AND GREEN (PASS) PROOF - STEP BY STEP
Run in PowerShell inside lucidflow-frontend. Do ONE mutation at a time.

0. Folders:  mkdir proof\screenshots, proof\logs   (already in this folder)
1. BASELINE (green):
   npm run test:run -- urlUtils 2>&1 | Tee-Object -FilePath proof\logs\urlUtils-0-base.txt
   Must show "9 passed". Screenshot -> proof\screenshots\urlUtils-0-green.png
2. BACKUP:   copy src\urlUtils.js src\urlUtils.js.bak
3. BREAK ONE LINE (see when-tests-fail.txt, e.g. mutation A). Save the file.
   Screenshot the edited line -> proof\screenshots\urlUtils-A-change.png
4. RED:
   npm run test:run -- urlUtils 2>&1 | Tee-Object -FilePath proof\logs\urlUtils-A-red.txt
   Must show FAIL + test name + "N failed". Screenshot (command, red FAIL name,
   summary line) -> proof\screenshots\urlUtils-A-red.png
5. RESTORE:  copy src\urlUtils.js.bak src\urlUtils.js
   fc src\urlUtils.js src\urlUtils.js.bak   (must say "no differences")
6. GREEN:
   npm run test:run -- urlUtils 2>&1 | Tee-Object -FilePath proof\logs\urlUtils-A-green.txt
   Screenshot -> proof\screenshots\urlUtils-A-green.png
7. Repeat 2-6 for the next mutation / file (theme, Layout, Home).
8. FINAL: npm run test:run  (all files) -> screenshot all green, then
   del src\*.bak
Naming: <file>-<mutation>-<red|green|change>.png
Do not commit the broken code. Always restore before the next mutation.
