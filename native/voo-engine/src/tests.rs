use super::*;

fn apply(scene: &mut Scene, ops: &[f32]) {
    scene.reserve_ops(ops.len() / 7);
    scene.ops.copy_from_slice(ops);
    scene.apply(ops.len() / 7);
}

#[test]
fn overlapping_nodes_respect_z_order_and_removal() {
    let mut scene = Scene::new();
    apply(
        &mut scene,
        &[1., 0., 0., 0., 50., 50., 1., 1., 1., 0., 0., 50., 50., 2.],
    );
    assert_eq!(scene.hit_test(20., 20.), 1);
    apply(&mut scene, &[0., 1., 0., 0., 0., 0., 0.]);
    assert_eq!(scene.hit_test(20., 20.), 0);
    assert_eq!(scene.hit_test(60., 60.), -1);
}

#[test]
fn translation_updates_cells_and_preserves_draw_transform() {
    let mut scene = Scene::new();
    apply(&mut scene, &[1., 0., 0., 0., 20., 20., 0.]);
    apply(&mut scene, &[2., 0., 300., -300., 0., 0., 0.]);
    assert_eq!(scene.hit_test(10., 10.), -1);
    assert_eq!(scene.hit_test(310., -290.), 0);
    assert_eq!(scene.draw_list(300., -300., 320., -280.), 1);
    assert_eq!(scene.transforms, vec![1., 0., 0., 1., 300., -300.]);
}

#[test]
fn large_bounds_and_negative_cells_remain_queryable() {
    let mut scene = Scene::new();
    apply(
        &mut scene,
        &[1., 0., -100000., -100000., 100000., 100000., 0.],
    );
    assert_eq!(scene.hit_test(-50000., -50000.), 0);
    assert_eq!(scene.query(-200000., -200000., 200000., 200000.), 1);
    apply(&mut scene, &[0., 0., 0., 0., 0., 0., 0.]);
    assert_eq!(scene.query(-200000., -200000., 200000., 200000.), 0);
}

#[test]
fn dirty_regions_include_old_and_new_bounds_and_reset_on_read() {
    let mut scene = Scene::new();
    apply(&mut scene, &[1., 0., 0., 0., 20., 20., 0.]);
    assert_eq!(scene.take_tiles(), vec![1]);
    scene.take_dirty();
    apply(&mut scene, &[2., 0., 600., 0., 0., 0., 0.]);
    assert_eq!(scene.take_dirty(), vec![0., 0., 620., 20.]);
    assert!(scene.take_dirty().is_empty());
    assert_eq!(scene.take_tiles(), vec![0, 0, 0, 1, 0]);
    assert_eq!(scene.take_tiles(), vec![0]);
    scene.tile_bucket(1);
    assert_eq!(scene.take_tiles(), vec![1]);
}
