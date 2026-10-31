import zipfile,os,sys
M,out=sys.argv[1:3]
z=zipfile.ZipFile(out,'w')
for r,_,fs in os.walk(M):
  for f in fs: p=os.path.join(r,f); z.write(p,os.path.relpath(p,M))
z.close(); print(out,os.path.getsize(out)/1e6)
