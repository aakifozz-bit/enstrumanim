import sys
from PIL import Image
out, cols = sys.argv[1], int(sys.argv[2]); files = sys.argv[3:]
ims=[Image.open(f).convert('RGB').resize((640,272)) for f in files]
rows=(len(ims)+cols-1)//cols
S=Image.new('RGB',(640*cols,272*rows))
for i,im in enumerate(ims): S.paste(im,((i%cols)*640,(i//cols)*272))
S.save(out)
