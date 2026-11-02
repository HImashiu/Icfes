# install.sh e s : merged session -> shared data (with backups)
set -e
e=$1; s=$2; P=/mnt/project-files/icfes; M=$P/pipeline/fix-20261026/merge/${e}_$s; T=$P/figures/traced/S11-${e}_$s
G=$P/data/S11-${e}_$s.golden.json
[ -f $G.bak-20261102-pre ] || cp -p $G $G.bak-20261102-pre
cp $M/S11-${e}_$s.golden.json $G
mkdir -p $T; [ -f $T/manifest.json ] && { [ -f $T/manifest.json.bak-20261102-pre ] || cp -p $T/manifest.json $T/manifest.json.bak-20261102-pre; }
cp $M/png/*.png $T/; cp $M/manifest.json $T/manifest.json
echo installed $e $s $(ls $M/png | wc -l) pngs
