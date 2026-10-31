# post1.sh e s : gpt-5 results staged -> cleaned, figures, merge, math requests
set -e
cd /home/claude/icfes
e=$1; s=$2; S=/home/claude/work; Q=/mnt/project-files/icfes/pipeline/queue/in; O=/mnt/user-data/uploads/Icfes/pipeline/queue/out; W=$S/R/$e-$s; mkdir -p $W
IN=/mnt/user-data/uploads/Downloads/icfes-azure-input; JS=/mnt/user-data/uploads/Downloads/icfes-azure-data/json
D=$(ls -d $S/crop/crops/S11-_${e}_${s}_* | head -1); L=$JS/$(basename "$D").json; PDF=$(ls "$IN"/S11-\ $e\ *$s* | head -1)
python3 -m icfes_polish.format_stage apply --golden $S/H/pre-${e}_$s.json --results $O/T-fmt-${e}_$s.*.jsonl --meta $Q/T-fmt-${e}_$s.meta.json --layout "$L" --out $W/cand.json --report $W/rep.json | tail -1
python3 -W ignore -m icfes_polish.visual bold --golden $W/cand.json --meta $Q/T-fmt-${e}_$s.meta.json --pdf "$PDF" --layout "$L" --out $W/bold.json --report $W/boldrep.json > /dev/null
bash $S/chain.sh $e $s T-fmt-${e}_$s $W/bold.json $W/rep.json $W | tail -1
bash $S/chain.sh $e $s T-fmt-${e}_$s $S/H/pre-${e}_$s.json $W/rep.json $S/v2/$e-$s | tail -1
M=/mnt/project-files/icfes/pipeline/fix-20261026/merge/${e}_$s
python3 $S/mergesess.py $W $S/v2/$e-$s S11-${e}_$s $M
python3 -m icfes_polish.math_stage build --golden $M/S11-${e}_$s.golden.json --crops "$D" --out $Q/M-${e}_$s.jsonl
