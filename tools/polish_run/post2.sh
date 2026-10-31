# post2.sh e s : math results staged -> applied, coverage, zip
set -e
cd /home/claude/icfes
e=$1; s=$2; S=/home/claude/work; Q=/mnt/project-files/icfes/pipeline/queue/in; O=/mnt/user-data/uploads/Icfes/pipeline/queue/out; W=$S/R/$e-$s
M=/mnt/project-files/icfes/pipeline/fix-20261026/merge/${e}_$s
JS=/mnt/user-data/uploads/Downloads/icfes-azure-data/json; D=$(ls -d $S/crop/crops/S11-_${e}_${s}_* | head -1); L=$JS/$(basename "$D").json
if ls $O/M-${e}_$s*.jsonl >/dev/null 2>&1; then python3 -m icfes_polish.math_stage apply --golden $M/S11-${e}_$s.golden.json --results $O/M-${e}_$s*.jsonl --out $M/S11-${e}_$s.golden.json --report $W/mathrep.json; fi
python3 -m icfes_polish.coverage --golden $M/S11-${e}_$s.golden.json --meta $Q/T-fmt-${e}_$s.meta.json --layout "$L" --manifest $M/manifest.json --out $W/coverage-m.json
python3 $S/zipsess.py $M /mnt/project-files/icfes/pipeline/fix-20261026/merge/${e}_$s-load.zip
