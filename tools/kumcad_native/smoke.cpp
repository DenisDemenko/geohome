#include "core/core3d/StepIges.h"

#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopExp_Explorer.hxx>
#include <TopAbs_ShapeEnum.hxx>

#include <iostream>
#include <string>

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: kumcad_step_smoke file.step [...file.step]\n";
        return 2;
    }
    for (int i = 1; i < argc; ++i) {
        const auto shape = lcad::readStep(argv[i]);
        if (shape.IsNull()) {
            std::cerr << "KumCAD STEP import failed: " << argv[i] << "\n";
            return 1;
        }
        GProp_GProps props;
        BRepGProp::VolumeProperties(shape, props);
        if (props.Mass() <= 0) {
            std::cerr << "KumCAD STEP import yielded non-positive volume: " << argv[i] << "\n";
            return 1;
        }
        int solids = 0;
        for (TopExp_Explorer explorer(shape, TopAbs_SOLID); explorer.More(); explorer.Next()) {
            ++solids;
        }
        if (solids == 0) {
            std::cerr << "KumCAD STEP import yielded no solids: " << argv[i] << "\n";
            return 1;
        }
        std::cout << "KumCAD readStep OK: " << argv[i] << ", solids=" << solids
                  << ", total_volume_mm3=" << props.Mass() << "\n";
    }
    return 0;
}
