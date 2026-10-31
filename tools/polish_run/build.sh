cd /home/claude/icfes
N=/home/claude/work; P=/mnt/project-files/icfes; IN=/mnt/user-data/uploads/Downloads/icfes-azure-input; JS=/mnt/user-data/uploads/Downloads/icfes-azure-data/json
for es in I_1ra I_2da J_1ra J_2da K1_1ra K1_2da L_1ra N_1ra N_2da O_1ra; do e=${es%_*}; s=${es#*_}
D=$(ls -d $N/crop/crops/S11-_${e}_${s}_* | head -1); L=$JS/$(basename "$D").json; PDF=$(ls "$IN"/S11-\ $e\ *$s* | head -1)
python3 -m icfes_polish.preformat $P/data/S11-${e}_$s.golden.json $N/H/pre-${e}_$s.json >/dev/null
echo "== $e $s $(ls "$L" >/dev/null && echo json-ok) | $(basename "$PDF") :: $(python3 -W ignore -m icfes_polish.format_stage build --golden $N/H/pre-${e}_$s.json --crops "$D" --pdf "$PDF" --layout "$L" --examples-before $P/data/S11-A_1ra.golden.json.bak-20261015-043701 --examples-after $P/data/S11-A_1ra.golden.json --deployment judge --effort low --fresh --out $P/pipeline/queue/in/T-fmt-${e}_$s.jsonl 2>&1 | tail -1)"
done
