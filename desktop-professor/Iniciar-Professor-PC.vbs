Set WshShell = CreateObject("WScript.Shell")
scriptPath = "c:\Users\filip\.gemini\antigravity\scratch\ireb-cpre-studio\desktop-professor\professor_desktop.pyw"
WshShell.Run """C:\Users\filip\AppData\Local\Programs\Python\Python312\pythonw.exe"" """ & scriptPath & """", 0, False
