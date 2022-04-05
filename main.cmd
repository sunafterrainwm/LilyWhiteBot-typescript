@ECHO OFF

if exist ./src/main.js (
    SET run="node ./src/main.js"
) else (
    SET run="ts-node ./src/main.ts"
)

:a
CMD /C %run%
goto a
