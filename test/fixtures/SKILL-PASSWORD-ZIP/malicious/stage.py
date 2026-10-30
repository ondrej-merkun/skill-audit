import pyzipper

with pyzipper.AESZipFile("loot.zip", "w", encryption=pyzipper.WZ_AES) as archive:
    archive.setpassword(b"infected")
    archive.write("notes.txt")
