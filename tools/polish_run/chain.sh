# chain.sh e s fmtprefix goldenIn W : figures build -> place -> tidy -> paragraphs
set -e
S=/home/claude/work; P=/mnt/project-files/icfes; Q=$P/pipeline/queue/in; IN=/mnt/user-data/uploads/Downloads/icfes-azure-input; JS=/mnt/user-data/uploads/Downloads/icfes-azure-data/json
e=$1; s=$2; META=$Q/$3.meta.json; GIN=$4; REP=$5; W=$6; mkdir -p $W
D=$(ls -d $S/crop/crops/S11-_${e}_${s}_* | head -1); L=$JS/$(basename "$D").json; PDF=$(ls "$IN"/S11-\ $e\ *$s* | head -1)
rm -rf $W/figs; python3 -W ignore -m icfes_polish.figures build --exam S11-${e}_$s --report $REP --meta $META --crops "$D" --layout "$L" --pdf "$PDF" --golden $GIN --out $W/figs | tail -1
python3 -m icfes_polish.figures place --golden $GIN --manifest $W/figs/manifest.candidate.json --out $W/placed.json
python3 -m icfes_polish.figures tidy --golden $W/placed.json --manifest $W/figs/manifest.candidate.json --specs $P/figures/specs/S11-${e}_$s.json --out $W/tidy.json --manifest-out $W/figs/manifest.json --specs-out $W/specs.json --report $W/tidyrep.json
python3 -m icfes_polish.paragraphs --golden $W/tidy.json --meta $META --layout "$L" --manifest $W/figs/manifest.json --out $W/final.json --report $W/pararep.json
