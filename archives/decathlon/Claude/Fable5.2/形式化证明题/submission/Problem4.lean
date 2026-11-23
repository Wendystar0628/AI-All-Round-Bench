import Mathlib.Combinatorics.SetFamily.Compression.Down
import Mathlib.Data.Finset.Interval
import Mathlib.Analysis.MeanInequalities

open Finset

namespace Problem4

variable {α : Type*} [DecidableEq α]

/-- Reimer's up-compression map, along the coordinates listed in `l`. -/
def phi : List α → Finset (Finset α) → Finset α → Finset α
  | [], _, A => A
  | x :: l, F, A =>
    if x ∈ A then insert x (phi l (F.memberSubfamily x) (A.erase x))
    else if phi l (F.nonMemberSubfamily x) A ∈
        (F.memberSubfamily x).image (phi l (F.memberSubfamily x))
      then phi l (F.nonMemberSubfamily x) A
      else insert x (phi l (F.nonMemberSubfamily x) A)

/-- The compressed family. -/
def up (l : List α) (F : Finset (Finset α)) : Finset (Finset α) := F.image (phi l F)

lemma mem_up {l : List α} {F : Finset (Finset α)} {V : Finset α} :
    V ∈ up l F ↔ ∃ A ∈ F, phi l F A = V := mem_image

lemma phi_cons_of_mem {x : α} {l : List α} {F : Finset (Finset α)} {A : Finset α}
    (h : x ∈ A) :
    phi (x :: l) F A = insert x (phi l (F.memberSubfamily x) (A.erase x)) := by
  rw [phi, if_pos h]

lemma phi_cons_of_not_mem_of_mem {x : α} {l : List α} {F : Finset (Finset α)} {A : Finset α}
    (h : x ∉ A) (h2 : phi l (F.nonMemberSubfamily x) A ∈ up l (F.memberSubfamily x)) :
    phi (x :: l) F A = phi l (F.nonMemberSubfamily x) A := by
  have h2' : phi l (F.nonMemberSubfamily x) A ∈
      (F.memberSubfamily x).image (phi l (F.memberSubfamily x)) := h2
  rw [phi, if_neg h, if_pos h2']

lemma phi_cons_of_not_mem_of_not_mem {x : α} {l : List α} {F : Finset (Finset α)}
    {A : Finset α}
    (h : x ∉ A) (h2 : phi l (F.nonMemberSubfamily x) A ∉ up l (F.memberSubfamily x)) :
    phi (x :: l) F A = insert x (phi l (F.nonMemberSubfamily x) A) := by
  have h2' : phi l (F.nonMemberSubfamily x) A ∉
      (F.memberSubfamily x).image (phi l (F.memberSubfamily x)) := h2
  rw [phi, if_neg h, if_neg h2']

lemma subset_phi (l : List α) : ∀ (F : Finset (Finset α)) (A : Finset α), A ⊆ phi l F A := by
  induction l with
  | nil => intro F A; rw [phi]
  | cons x l ih =>
    intro F A
    by_cases h1 : x ∈ A
    · rw [phi_cons_of_mem h1]
      have := ih (F.memberSubfamily x) (A.erase x)
      calc A = insert x (A.erase x) := (insert_erase h1).symm
        _ ⊆ _ := insert_subset_insert x this
    · by_cases h2 : phi l (F.nonMemberSubfamily x) A ∈ up l (F.memberSubfamily x)
      · rw [phi_cons_of_not_mem_of_mem h1 h2]
        exact ih _ A
      · rw [phi_cons_of_not_mem_of_not_mem h1 h2]
        exact (ih _ A).trans (subset_insert _ _)

lemma phi_subset (l : List α) :
    ∀ (F : Finset (Finset α)) (A : Finset α), phi l F A ⊆ A ∪ l.toFinset := by
  induction l with
  | nil => intro F A; rw [phi]; exact subset_union_left
  | cons x l ih =>
    intro F A
    have e : A ∪ (x :: l).toFinset = insert x (A ∪ l.toFinset) := by
      rw [List.toFinset_cons, union_insert]
    rw [e]
    by_cases h1 : x ∈ A
    · rw [phi_cons_of_mem h1]
      apply insert_subset_insert
      exact (ih _ (A.erase x)).trans (union_subset_union_left (erase_subset _ _))
    · by_cases h2 : phi l (F.nonMemberSubfamily x) A ∈ up l (F.memberSubfamily x)
      · rw [phi_cons_of_not_mem_of_mem h1 h2]
        exact (ih _ A).trans (subset_insert _ _)
      · rw [phi_cons_of_not_mem_of_not_mem h1 h2]
        exact insert_subset_insert _ (ih _ A)

lemma not_mem_phi {x : α} {l : List α} (hx : x ∉ l) (F : Finset (Finset α)) {A : Finset α}
    (hA : x ∉ A) : x ∉ phi l F A := by
  intro h
  have := phi_subset l F A h
  rw [mem_union, List.mem_toFinset] at this
  tauto

lemma erase_phi_cons_of_mem {x : α} {l : List α} (hx : x ∉ l) {F : Finset (Finset α)}
    {A : Finset α} (h : x ∈ A) :
    (phi (x :: l) F A).erase x = phi l (F.memberSubfamily x) (A.erase x) := by
  rw [phi_cons_of_mem h, erase_insert (not_mem_phi hx _ (notMem_erase x A))]

lemma erase_phi_cons_of_not_mem {x : α} {l : List α} (hx : x ∉ l) {F : Finset (Finset α)}
    {A : Finset α} (h : x ∉ A) :
    (phi (x :: l) F A).erase x = phi l (F.nonMemberSubfamily x) A := by
  have hX := not_mem_phi hx (F.nonMemberSubfamily x) h
  by_cases h2 : phi l (F.nonMemberSubfamily x) A ∈ up l (F.memberSubfamily x)
  · rw [phi_cons_of_not_mem_of_mem h h2, erase_eq_of_notMem hX]
  · rw [phi_cons_of_not_mem_of_not_mem h h2, erase_insert hX]

lemma mem_phi_cons_iff {x : α} {l : List α} (hx : x ∉ l) {F : Finset (Finset α)}
    {A : Finset α} (h : x ∉ A) :
    x ∈ phi (x :: l) F A ↔ phi l (F.nonMemberSubfamily x) A ∉ up l (F.memberSubfamily x) := by
  have hX := not_mem_phi hx (F.nonMemberSubfamily x) h
  by_cases h2 : phi l (F.nonMemberSubfamily x) A ∈ up l (F.memberSubfamily x)
  · rw [phi_cons_of_not_mem_of_mem h h2]
    exact ⟨fun h' => absurd h' hX, fun h' => absurd h2 h'⟩
  · rw [phi_cons_of_not_mem_of_not_mem h h2]
    exact ⟨fun _ => h2, fun _ => mem_insert_self _ _⟩

lemma erase_mem_member {F : Finset (Finset α)} {A : Finset α} {x : α} (hA : A ∈ F)
    (hx : x ∈ A) : A.erase x ∈ F.memberSubfamily x :=
  mem_memberSubfamily.2 ⟨by rw [insert_erase hx]; exact hA, notMem_erase _ _⟩

lemma mem_up_cons {x : α} {l : List α} (hx : x ∉ l) (F : Finset (Finset α)) (V : Finset α) :
    V ∈ up (x :: l) F ↔
      (x ∈ V ∧ (V.erase x ∈ up l (F.memberSubfamily x) ∨
        V.erase x ∈ up l (F.nonMemberSubfamily x))) ∨
      (x ∉ V ∧ V ∈ up l (F.nonMemberSubfamily x) ∧ V ∈ up l (F.memberSubfamily x)) := by
  constructor
  · intro hV
    obtain ⟨A, hA, rfl⟩ := mem_up.1 hV
    by_cases h : x ∈ A
    · left
      refine ⟨by rw [phi_cons_of_mem h]; exact mem_insert_self _ _, Or.inl ?_⟩
      rw [erase_phi_cons_of_mem hx h]
      exact mem_up.2 ⟨_, erase_mem_member hA h, rfl⟩
    · have hA0 : A ∈ F.nonMemberSubfamily x := mem_nonMemberSubfamily.2 ⟨hA, h⟩
      have hX : phi l (F.nonMemberSubfamily x) A ∈ up l (F.nonMemberSubfamily x) :=
        mem_up.2 ⟨A, hA0, rfl⟩
      by_cases h2 : phi l (F.nonMemberSubfamily x) A ∈ up l (F.memberSubfamily x)
      · right
        rw [phi_cons_of_not_mem_of_mem h h2]
        exact ⟨not_mem_phi hx _ h, hX, h2⟩
      · left
        refine ⟨(mem_phi_cons_iff hx h).2 h2, Or.inr ?_⟩
        rw [erase_phi_cons_of_not_mem hx h]
        exact hX
  · have hcase1 : x ∈ V → V.erase x ∈ up l (F.memberSubfamily x) → V ∈ up (x :: l) F := by
      intro hxV h
      obtain ⟨B, hB, hBV⟩ := mem_up.1 h
      rw [mem_memberSubfamily] at hB
      refine mem_up.2 ⟨insert x B, hB.1, ?_⟩
      rw [phi_cons_of_mem (mem_insert_self x B), erase_insert hB.2, hBV, insert_erase hxV]
    rintro (⟨hxV, h | h⟩ | ⟨hxV, h0, h1⟩)
    · exact hcase1 hxV h
    · by_cases h2 : V.erase x ∈ up l (F.memberSubfamily x)
      · exact hcase1 hxV h2
      · obtain ⟨A, hA, hAV⟩ := mem_up.1 h
        rw [mem_nonMemberSubfamily] at hA
        refine mem_up.2 ⟨A, hA.1, ?_⟩
        rw [phi_cons_of_not_mem_of_not_mem hA.2 (by rw [hAV]; exact h2), hAV,
          insert_erase hxV]
    · obtain ⟨A, hA, hAV⟩ := mem_up.1 h0
      rw [mem_nonMemberSubfamily] at hA
      refine mem_up.2 ⟨A, hA.1, ?_⟩
      rw [phi_cons_of_not_mem_of_mem hA.2 (by rw [hAV]; exact h1), hAV]

lemma phi_injOn (l : List α) : l.Nodup → ∀ (F : Finset (Finset α)),
    ∀ A ∈ F, ∀ B ∈ F, phi l F A = phi l F B → A = B := by
  induction l with
  | nil => intro _ F A _ B _ h; rwa [phi, phi] at h
  | cons x l ih =>
    intro hl F A hA B hB h
    have hx : x ∉ l := (List.nodup_cons.1 hl).1
    have hl' : l.Nodup := (List.nodup_cons.1 hl).2
    by_cases hxA : x ∈ A <;> by_cases hxB : x ∈ B
    · have h1 := erase_phi_cons_of_mem hx (F := F) hxA
      have h2 := erase_phi_cons_of_mem hx (F := F) hxB
      rw [h] at h1
      have h3 := ih hl' (F.memberSubfamily x) (A.erase x) (erase_mem_member hA hxA)
        (B.erase x) (erase_mem_member hB hxB) (h1.symm.trans h2)
      rw [← insert_erase hxA, ← insert_erase hxB, h3]
    · exfalso
      have h1 : x ∈ phi (x :: l) F B := by
        rw [← h, phi_cons_of_mem hxA]; exact mem_insert_self _ _
      have h2 := (mem_phi_cons_iff hx hxB).1 h1
      apply h2
      rw [← erase_phi_cons_of_not_mem hx hxB, ← h, erase_phi_cons_of_mem hx hxA]
      exact mem_up.2 ⟨_, erase_mem_member hA hxA, rfl⟩
    · exfalso
      have h1 : x ∈ phi (x :: l) F A := by
        rw [h, phi_cons_of_mem hxB]; exact mem_insert_self _ _
      have h2 := (mem_phi_cons_iff hx hxA).1 h1
      apply h2
      rw [← erase_phi_cons_of_not_mem hx hxA, h, erase_phi_cons_of_mem hx hxB]
      exact mem_up.2 ⟨_, erase_mem_member hB hxB, rfl⟩
    · have h1 := erase_phi_cons_of_not_mem hx (F := F) hxA
      have h2 := erase_phi_cons_of_not_mem hx (F := F) hxB
      rw [h] at h1
      exact ih hl' (F.nonMemberSubfamily x) A (mem_nonMemberSubfamily.2 ⟨hA, hxA⟩) B
        (mem_nonMemberSubfamily.2 ⟨hB, hxB⟩) (h1.symm.trans h2)

lemma up_upper (l : List α) : l.Nodup → ∀ (F : Finset (Finset α)) (U V : Finset α),
    U ∈ up l F → U ⊆ V → V \ U ⊆ l.toFinset → V ∈ up l F := by
  induction l with
  | nil =>
    intro _ F U V hU hUV hVU
    have hVU' : V ⊆ U := by
      rw [← sdiff_eq_empty_iff_subset]
      exact subset_empty.1 (by simpa using hVU)
    have : V = U := subset_antisymm hVU' hUV
    rw [this]; exact hU
  | cons x l ih =>
    intro hl F U V hU hUV hVU
    have hx : x ∉ l := (List.nodup_cons.1 hl).1
    have hl' : l.Nodup := (List.nodup_cons.1 hl).2
    rw [mem_up_cons hx] at hU ⊢
    have key : ∀ y, y ∈ V → y ∉ U → y ≠ x → y ∈ l.toFinset := by
      intro y hyV hyU hyx
      have := hVU (mem_sdiff.2 ⟨hyV, hyU⟩)
      rw [List.toFinset_cons, mem_insert] at this
      exact this.resolve_left hyx
    rcases hU with ⟨hxU, h⟩ | ⟨hxU, h0, h1⟩
    · left
      have hxV : x ∈ V := hUV hxU
      have hsub : U.erase x ⊆ V.erase x := erase_subset_erase x hUV
      have hdiff : V.erase x \ U.erase x ⊆ l.toFinset := by
        intro y hy
        rw [mem_sdiff, mem_erase, mem_erase] at hy
        exact key y hy.1.2 (fun hyU => hy.2 ⟨hy.1.1, hyU⟩) hy.1.1
      refine ⟨hxV, ?_⟩
      rcases h with h | h
      · exact Or.inl (ih hl' _ _ _ h hsub hdiff)
      · exact Or.inr (ih hl' _ _ _ h hsub hdiff)
    · by_cases hxV : x ∈ V
      · left
        refine ⟨hxV, Or.inl ?_⟩
        have hsub : U ⊆ V.erase x :=
          fun y hy => mem_erase.2 ⟨fun h => hxU (h ▸ hy), hUV hy⟩
        have hdiff : V.erase x \ U ⊆ l.toFinset := by
          intro y hy
          rw [mem_sdiff, mem_erase] at hy
          exact key y hy.1.2 hy.2 hy.1.1
        exact ih hl' _ _ _ h1 hsub hdiff
      · right
        have hdiff : V \ U ⊆ l.toFinset := by
          intro y hy
          rw [mem_sdiff] at hy
          exact key y hy.1 hy.2 (fun h => hxV (h ▸ hy.1))
        exact ⟨hxV, ih hl' _ _ _ h0 hUV hdiff, ih hl' _ _ _ h1 hUV hdiff⟩

lemma join11 {G H : Finset (Finset α)} {x : α} (h : ∀ A ∈ G, ∀ C ∈ H, A ∪ C ∈ H) :
    ∀ A ∈ G.memberSubfamily x, ∀ C ∈ H.memberSubfamily x, A ∪ C ∈ H.memberSubfamily x := by
  intro A hA C hC
  rw [mem_memberSubfamily] at hA hC ⊢
  refine ⟨?_, fun hx => ?_⟩
  · have := h _ hA.1 _ hC.1
    rwa [← insert_union_distrib] at this
  · rcases mem_union.1 hx with h' | h'
    exacts [hA.2 h', hC.2 h']

lemma join00 {G H : Finset (Finset α)} {x : α} (h : ∀ A ∈ G, ∀ C ∈ H, A ∪ C ∈ H) :
    ∀ A ∈ G.nonMemberSubfamily x, ∀ C ∈ H.nonMemberSubfamily x,
      A ∪ C ∈ H.nonMemberSubfamily x := by
  intro A hA C hC
  rw [mem_nonMemberSubfamily] at hA hC ⊢
  refine ⟨h _ hA.1 _ hC.1, fun hx => ?_⟩
  rcases mem_union.1 hx with h' | h'
  exacts [hA.2 h', hC.2 h']

lemma join01 {G H : Finset (Finset α)} {x : α} (h : ∀ A ∈ G, ∀ C ∈ H, A ∪ C ∈ H) :
    ∀ A ∈ G.nonMemberSubfamily x, ∀ C ∈ H.memberSubfamily x,
      A ∪ C ∈ H.memberSubfamily x := by
  intro A hA C hC
  rw [mem_nonMemberSubfamily] at hA
  rw [mem_memberSubfamily] at hC ⊢
  refine ⟨?_, fun hx => ?_⟩
  · have := h _ hA.1 _ hC.1
    rwa [union_insert] at this
  · rcases mem_union.1 hx with h' | h'
    exacts [hA.2 h', hC.2 h']

lemma join10 {G H : Finset (Finset α)} {x : α} (h : ∀ A ∈ G, ∀ C ∈ H, A ∪ C ∈ H) :
    ∀ A ∈ G.memberSubfamily x, ∀ C ∈ H.nonMemberSubfamily x,
      A ∪ C ∈ H.memberSubfamily x := by
  intro A hA C hC
  rw [mem_nonMemberSubfamily] at hC
  rw [mem_memberSubfamily] at hA ⊢
  refine ⟨?_, fun hx => ?_⟩
  · have := h _ hA.1 _ hC.1
    rwa [insert_union] at this
  · rcases mem_union.1 hx with h' | h'
    exacts [hA.2 h', hC.2 h']

lemma star (l : List α) : l.Nodup → ∀ (G H : Finset (Finset α)),
    (∀ A ∈ G, ∀ C ∈ H, A ∪ C ∈ H) → ∀ A ∈ G, ∀ C ∈ H, A ⊆ C → C ⊆ phi l G A →
    phi l G A ∈ up l H := by
  induction l with
  | nil =>
    intro _ G H _ A _ C hC hAC hCA
    rw [phi] at hCA ⊢
    have : A = C := subset_antisymm hAC hCA
    rw [this]
    exact mem_up.2 ⟨C, hC, by rw [phi]⟩
  | cons x l ih =>
    intro hl G H hGH A hA C hC hAC hCA
    have hx : x ∉ l := (List.nodup_cons.1 hl).1
    have hl' : l.Nodup := (List.nodup_cons.1 hl).2
    rw [mem_up_cons hx]
    by_cases hxA : x ∈ A
    · have hxC : x ∈ C := hAC hxA
      left
      refine ⟨by rw [phi_cons_of_mem hxA]; exact mem_insert_self _ _, Or.inl ?_⟩
      rw [erase_phi_cons_of_mem hx hxA]
      apply ih hl' (G.memberSubfamily x) (H.memberSubfamily x) (join11 hGH) (A.erase x)
        (erase_mem_member hA hxA) (C.erase x) (erase_mem_member hC hxC)
        (erase_subset_erase x hAC)
      rw [← erase_phi_cons_of_mem hx hxA]
      exact erase_subset_erase x hCA
    · have hA0 : A ∈ G.nonMemberSubfamily x := mem_nonMemberSubfamily.2 ⟨hA, hxA⟩
      have hXe := erase_phi_cons_of_not_mem hx (F := G) hxA
      by_cases hxC : x ∈ C
      · have hxphi : x ∈ phi (x :: l) G A := hCA hxC
        left
        refine ⟨hxphi, Or.inl ?_⟩
        rw [hXe]
        apply ih hl' (G.nonMemberSubfamily x) (H.memberSubfamily x) (join01 hGH) A hA0
          (C.erase x) (erase_mem_member hC hxC)
        · intro y hy
          exact mem_erase.2 ⟨fun h => hxA (h ▸ hy), hAC hy⟩
        · rw [← hXe]
          exact erase_subset_erase x hCA
      · have hC0 : C ∈ H.nonMemberSubfamily x := mem_nonMemberSubfamily.2 ⟨hC, hxC⟩
        have hCX : C ⊆ phi l (G.nonMemberSubfamily x) A := by
          rw [← hXe]
          intro y hy
          exact mem_erase.2 ⟨fun h => hxC (h ▸ hy), hCA hy⟩
        have hX0 : phi l (G.nonMemberSubfamily x) A ∈ up l (H.nonMemberSubfamily x) :=
          ih hl' _ _ (join00 hGH) A hA0 C hC0 hAC hCX
        by_cases h2 : phi l (G.nonMemberSubfamily x) A ∈ up l (G.memberSubfamily x)
        · right
          rw [phi_cons_of_not_mem_of_mem hxA h2]
          refine ⟨not_mem_phi hx _ hxA, hX0, ?_⟩
          obtain ⟨E, hE, hEX⟩ := mem_up.1 h2
          obtain ⟨D, hD, hDX⟩ := mem_up.1 hX0
          have hED : E ∪ D ∈ H.memberSubfamily x := join10 hGH E hE D hD
          have hsub : E ∪ D ⊆ phi l (G.memberSubfamily x) E := by
            apply union_subset
            · exact subset_phi _ _ _
            · rw [hEX, ← hDX]
              exact subset_phi _ _ _
          have := ih hl' (G.memberSubfamily x) (H.memberSubfamily x) (join11 hGH) E hE
            (E ∪ D) hED subset_union_left hsub
          rwa [hEX] at this
        · left
          refine ⟨(mem_phi_cons_iff hx hxA).2 h2, Or.inr ?_⟩
          rw [hXe]
          exact hX0

lemma interval_eq (l : List α) : l.Nodup → ∀ (F : Finset (Finset α)),
    (∀ A ∈ F, ∀ C ∈ F, A ∪ C ∈ F) → ∀ A ∈ F, ∀ C ∈ F, A ⊆ C → C ⊆ phi l F A → A = C := by
  induction l with
  | nil =>
    intro _ F _ A _ C _ hAC hCA
    rw [phi] at hCA
    exact subset_antisymm hAC hCA
  | cons x l ih =>
    intro hl F hF A hA C hC hAC hCA
    have hx : x ∉ l := (List.nodup_cons.1 hl).1
    have hl' : l.Nodup := (List.nodup_cons.1 hl).2
    by_cases hxA : x ∈ A
    · have hxC : x ∈ C := hAC hxA
      have h3 := ih hl' (F.memberSubfamily x) (join11 hF) (A.erase x)
        (erase_mem_member hA hxA) (C.erase x) (erase_mem_member hC hxC)
        (erase_subset_erase x hAC)
        (by rw [← erase_phi_cons_of_mem hx hxA]; exact erase_subset_erase x hCA)
      rw [← insert_erase hxA, ← insert_erase hxC, h3]
    · have hA0 : A ∈ F.nonMemberSubfamily x := mem_nonMemberSubfamily.2 ⟨hA, hxA⟩
      have hXe := erase_phi_cons_of_not_mem hx (F := F) hxA
      by_cases hxC : x ∈ C
      · exfalso
        have hxphi : x ∈ phi (x :: l) F A := hCA hxC
        have h2 := (mem_phi_cons_iff hx hxA).1 hxphi
        apply h2
        apply star l hl' (F.nonMemberSubfamily x) (F.memberSubfamily x) (join01 hF) A hA0
          (C.erase x) (erase_mem_member hC hxC)
        · intro y hy
          exact mem_erase.2 ⟨fun h => hxA (h ▸ hy), hAC hy⟩
        · rw [← hXe]
          exact erase_subset_erase x hCA
      · have hC0 : C ∈ F.nonMemberSubfamily x := mem_nonMemberSubfamily.2 ⟨hC, hxC⟩
        apply ih hl' (F.nonMemberSubfamily x) (join00 hF) A hA0 C hC0 hAC
        rw [← hXe]
        intro y hy
        exact mem_erase.2 ⟨fun h => hxC (h ▸ hy), hCA hy⟩

/-! ### Counting -/

lemma sum_split (x : α) (𝒜 : Finset (Finset α)) (g : Finset α → ℕ) :
    ∑ U ∈ 𝒜, g U = ∑ U ∈ 𝒜.nonMemberSubfamily x, g U
      + ∑ W ∈ 𝒜.memberSubfamily x, g (insert x W) := by
  rw [nonMemberSubfamily, memberSubfamily, sum_image]
  · rw [add_comm, ← sum_filter_add_sum_filter_not 𝒜 (fun s => x ∈ s)]
    congr 1
    apply sum_congr rfl
    intro s hs
    rw [insert_erase (mem_filter.1 hs).2]
  · intro s hs t ht hst
    have hs' := (mem_filter.1 (mem_coe.1 hs)).2
    have ht' := (mem_filter.1 (mem_coe.1 ht)).2
    have hst' : s.erase x = t.erase x := hst
    rw [← insert_erase hs', ← insert_erase ht', hst']

lemma ineq (a b : ℕ) (h : a ≤ b) : a ^ a * 4 ^ a * b ^ b ≤ (a + b) ^ (a + b) := by
  obtain ⟨c, rfl⟩ := Nat.exists_eq_add_of_le h
  have h1 : 4 * a * (a + c) ≤ (a + (a + c)) ^ 2 := by nlinarith [sq_nonneg c]
  have h2 : (4 * a * (a + c)) ^ a ≤ ((a + (a + c)) ^ 2) ^ a := Nat.pow_le_pow_left h1 a
  have h3 : (a + c) ^ c ≤ (a + (a + c)) ^ c := Nat.pow_le_pow_left (by omega) c
  calc a ^ a * 4 ^ a * (a + c) ^ (a + c)
      = (4 * a * (a + c)) ^ a * (a + c) ^ c := by
        rw [mul_pow, mul_pow, pow_add]; ring
    _ ≤ ((a + (a + c)) ^ 2) ^ a * (a + (a + c)) ^ c := Nat.mul_le_mul h2 h3
    _ = (a + (a + c)) ^ (a + (a + c)) := by
        rw [← pow_mul, ← pow_add]; congr 1; ring

lemma one_le_self_pow (m : ℕ) : 1 ≤ m ^ m := by
  rcases Nat.eq_zero_or_pos m with h | h
  · rw [h]; norm_num
  · exact Nat.one_le_pow _ _ h

lemma upset_bound (S : Finset α) : ∀ (𝒰 : Finset (Finset α)),
    (∀ U ∈ 𝒰, U ⊆ S) → (∀ U ∈ 𝒰, ∀ V, U ⊆ V → V ⊆ S → V ∈ 𝒰) →
    4 ^ (∑ U ∈ 𝒰, (S \ U).card) ≤ 𝒰.card ^ 𝒰.card := by
  induction S using Finset.induction_on with
  | empty =>
    intro 𝒰 _ _
    have : ∑ U ∈ 𝒰, ((∅ : Finset α) \ U).card = 0 := by simp
    rw [this, pow_zero]
    exact one_le_self_pow _
  | insert x S hx ih =>
    intro 𝒰 h1 h2
    have hw0 : ∀ U ∈ 𝒰.nonMemberSubfamily x, U ⊆ S := by
      intro U hU
      rw [mem_nonMemberSubfamily] at hU
      exact (subset_insert_iff_of_notMem hU.2).1 (h1 U hU.1)
    have hw1 : ∀ W ∈ 𝒰.memberSubfamily x, W ⊆ S := by
      intro W hW
      rw [mem_memberSubfamily] at hW
      have := h1 _ hW.1
      exact (subset_insert_iff_of_notMem hW.2).1 ((subset_insert x W).trans this)
    have hu0 : ∀ U ∈ 𝒰.nonMemberSubfamily x, ∀ V, U ⊆ V → V ⊆ S →
        V ∈ 𝒰.nonMemberSubfamily x := by
      intro U hU V hUV hVS
      rw [mem_nonMemberSubfamily] at hU ⊢
      exact ⟨h2 U hU.1 V hUV (hVS.trans (subset_insert _ _)), fun h => hx (hVS h)⟩
    have hu1 : ∀ W ∈ 𝒰.memberSubfamily x, ∀ V, W ⊆ V → V ⊆ S →
        V ∈ 𝒰.memberSubfamily x := by
      intro W hW V hWV hVS
      rw [mem_memberSubfamily] at hW ⊢
      exact ⟨h2 _ hW.1 _ (insert_subset_insert x hWV) (insert_subset_insert x hVS),
        fun h => hx (hVS h)⟩
    have hsub : 𝒰.nonMemberSubfamily x ⊆ 𝒰.memberSubfamily x := by
      intro U hU
      have hUS := hw0 U hU
      rw [mem_nonMemberSubfamily] at hU
      rw [mem_memberSubfamily]
      exact ⟨h2 U hU.1 _ (subset_insert _ _) (insert_subset_insert x hUS), hU.2⟩
    have hcard := card_memberSubfamily_add_card_nonMemberSubfamily x 𝒰
    have hle := card_le_card hsub
    have ih0 := ih _ hw0 hu0
    have ih1 := ih _ hw1 hu1
    rw [sum_split x 𝒰]
    have e0 : ∑ U ∈ 𝒰.nonMemberSubfamily x, (insert x S \ U).card
        = ∑ U ∈ 𝒰.nonMemberSubfamily x, (S \ U).card + (𝒰.nonMemberSubfamily x).card := by
      rw [card_eq_sum_ones, ← sum_add_distrib]
      apply sum_congr rfl
      intro U hU
      rw [mem_nonMemberSubfamily] at hU
      rw [insert_sdiff_of_notMem _ hU.2,
        card_insert_of_notMem (fun h => hx (mem_sdiff.1 h).1)]
    have e1 : ∑ W ∈ 𝒰.memberSubfamily x, (insert x S \ insert x W).card
        = ∑ W ∈ 𝒰.memberSubfamily x, (S \ W).card := by
      apply sum_congr rfl
      intro W _
      congr 1
      ext y
      simp only [mem_sdiff, mem_insert]
      constructor
      · rintro ⟨h | h, h'⟩
        · exact absurd (Or.inl h) h'
        · exact ⟨h, fun hw => h' (Or.inr hw)⟩
      · rintro ⟨h, h'⟩
        exact ⟨Or.inr h, fun hh => hh.elim (fun e => hx (e ▸ h)) h'⟩
    rw [e0, e1, ← hcard]
    set m0 := (𝒰.nonMemberSubfamily x).card
    set m1 := (𝒰.memberSubfamily x).card
    set s0 := ∑ U ∈ 𝒰.nonMemberSubfamily x, (S \ U).card
    set s1 := ∑ W ∈ 𝒰.memberSubfamily x, (S \ W).card
    calc 4 ^ (s0 + m0 + s1) = 4 ^ s0 * 4 ^ m0 * 4 ^ s1 := by rw [pow_add, pow_add]
      _ ≤ m0 ^ m0 * 4 ^ m0 * m1 ^ m1 := Nat.mul_le_mul (Nat.mul_le_mul_right _ ih0) ih1
      _ ≤ (m0 + m1) ^ (m0 + m1) := ineq m0 m1 hle
      _ = (m1 + m0) ^ (m1 + m0) := by rw [add_comm]

lemma amgm {ι : Type*} (s : Finset ι) (d : ι → ℕ) :
    s.card ^ s.card * 2 ^ (∑ i ∈ s, d i) ≤ (∑ i ∈ s, 2 ^ d i) ^ s.card := by
  rcases s.eq_empty_or_nonempty with rfl | hs
  · simp
  have hm : 0 < s.card := card_pos.2 hs
  have hm' : (0 : ℝ) < s.card := by exact_mod_cast hm
  have key := Real.geom_mean_le_arith_mean_weighted s (fun _ => (1 : ℝ) / s.card)
    (fun i => (2 : ℝ) ^ d i) (fun i _ => by positivity)
    (by rw [sum_const, nsmul_eq_mul]; field_simp) (fun i _ => by positivity)
  have h1 : (∏ i ∈ s, ((2 : ℝ) ^ d i) ^ ((1 : ℝ) / s.card)) ^ s.card
      = 2 ^ (∑ i ∈ s, d i) := by
    rw [← prod_pow, ← prod_pow_eq_pow_sum]
    apply prod_congr rfl
    intro i _
    rw [← Real.rpow_natCast, ← Real.rpow_mul (by positivity)]
    have : (1 : ℝ) / s.card * s.card = 1 := by field_simp
    rw [this, Real.rpow_one]
  have h2 : (∑ i ∈ s, (1 : ℝ) / s.card * (2 : ℝ) ^ d i) ^ s.card * (s.card : ℝ) ^ s.card
      = (∑ i ∈ s, (2 : ℝ) ^ d i) ^ s.card := by
    rw [← mul_pow, ← mul_sum]
    congr 1
    field_simp
  have h3 := pow_le_pow_left₀ (prod_nonneg (fun i _ => by positivity)) key s.card
  rw [h1] at h3
  have h4 : ((s.card : ℝ)) ^ s.card * 2 ^ (∑ i ∈ s, d i)
      ≤ (∑ i ∈ s, (2 : ℝ) ^ d i) ^ s.card := by
    rw [← h2, mul_comm]
    exact mul_le_mul_of_nonneg_right h3 (by positivity)
  exact_mod_cast h4

lemma interval_sum (l : List α) (hl : l.Nodup) (F : Finset (Finset α))
    (hF : ∀ A ∈ F, ∀ C ∈ F, A ∪ C ∈ F) (hW : ∀ A ∈ F, A ⊆ l.toFinset) :
    ∑ A ∈ F, 2 ^ ((phi l F A).card - A.card) ≤ 2 ^ l.toFinset.card := by
  have hdisj : (F : Set (Finset α)).PairwiseDisjoint (fun A => Finset.Icc A (phi l F A)) := by
    intro A hA B hB hAB
    rw [Function.onFun, Finset.disjoint_left]
    intro T hTA hTB
    rw [Finset.mem_Icc] at hTA hTB
    apply hAB
    have hU : A ∪ B ∈ F := hF A hA B hB
    have e1 : A = A ∪ B := interval_eq l hl F hF A hA _ hU subset_union_left
      ((union_subset hTA.1 hTB.1).trans hTA.2)
    have e2 : B = A ∪ B := interval_eq l hl F hF B hB _ hU subset_union_right
      ((union_subset hTA.1 hTB.1).trans hTB.2)
    exact e1.trans e2.symm
  have hcard : ∑ A ∈ F, 2 ^ ((phi l F A).card - A.card)
      = (F.biUnion (fun A => Finset.Icc A (phi l F A))).card := by
    rw [card_biUnion hdisj]
    apply sum_congr rfl
    intro A _
    rw [card_Icc_finset (subset_phi l F A)]
  rw [hcard, ← card_powerset]
  apply card_le_card
  intro T hT
  obtain ⟨A, hA, hTA⟩ := mem_biUnion.1 hT
  rw [Finset.mem_Icc] at hTA
  rw [mem_powerset]
  refine hTA.2.trans ((phi_subset l F A).trans ?_)
  exact union_subset (hW A hA) subset_rfl

theorem main {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hA : A.Nonempty)
    (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) :
    A.card ^ A.card ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := by
  set S : Finset α := A.biUnion id with hS
  set l : List α := S.toList with hl
  have hnd : l.Nodup := S.nodup_toList
  have hlS : l.toFinset = S := S.toList_toFinset
  have hW : ∀ a ∈ A, a ⊆ l.toFinset := by
    intro a ha
    rw [hlS]
    exact Finset.subset_biUnion_of_mem id ha
  have hinj : ∀ a ∈ A, ∀ b ∈ A, phi l A a = phi l A b → a = b := phi_injOn l hnd A
  have hsub : ∀ a ∈ A, a ⊆ phi l A a := fun a _ => subset_phi l A a
  have hφS : ∀ a ∈ A, phi l A a ⊆ S := by
    intro a ha
    refine (phi_subset l A a).trans ?_
    rw [hlS]
    exact Finset.union_subset (hlS ▸ hW a ha) subset_rfl
  -- upset bound
  have hC1 := upset_bound S (up l A)
    (by
      intro U hU
      obtain ⟨a, ha, rfl⟩ := mem_up.1 hU
      exact hφS a ha)
    (by
      intro U hU V hUV hVS
      exact up_upper l hnd A U V hU hUV (by rw [hlS]; exact Finset.sdiff_subset.trans hVS))
  have hinjOn : Set.InjOn (phi l A) (A : Set (Finset α)) :=
    fun a ha b hb h => hinj a (Finset.mem_coe.1 ha) b (Finset.mem_coe.1 hb) h
  have hcardU : (up l A).card = A.card := Finset.card_image_of_injOn hinjOn
  have hsumU : ∑ U ∈ up l A, (S \ U).card = ∑ a ∈ A, (S \ phi l A a).card :=
    Finset.sum_image hinjOn
  rw [hcardU, hsumU] at hC1
  -- disjoint intervals + AM-GM
  have hC2 := interval_sum l hnd A hunion hW
  rw [hlS] at hC2
  have hC3 := amgm A (fun a => (phi l A a).card - a.card)
  -- combine
  have e1 : ∀ a ∈ A, (S \ phi l A a).card + (phi l A a).card = S.card := fun a ha => by
    rw [Finset.card_sdiff_of_subset (hφS a ha)]
    exact Nat.sub_add_cancel (Finset.card_le_card (hφS a ha))
  have e2 : ∀ a ∈ A, ((phi l A a).card - a.card) + a.card = (phi l A a).card :=
    fun a ha => Nat.sub_add_cancel (Finset.card_le_card (hsub a ha))
  have s1 : ∑ a ∈ A, (S \ phi l A a).card + ∑ a ∈ A, (phi l A a).card = S.card * A.card := by
    rw [← Finset.sum_add_distrib, Finset.sum_congr rfl e1, Finset.sum_const, smul_eq_mul,
      mul_comm]
  have s2 : ∑ a ∈ A, ((phi l A a).card - a.card) + ∑ a ∈ A, a.card
      = ∑ a ∈ A, (phi l A a).card := by
    rw [← Finset.sum_add_distrib, Finset.sum_congr rfl e2]
  generalize (∑ a ∈ A, (S \ phi l A a).card) = X at hC1 s1
  generalize (∑ a ∈ A, (phi l A a).card) = Y at s1 s2
  generalize (∑ a ∈ A, ((phi l A a).card - a.card)) = Z at hC3 s2
  generalize (∑ a ∈ A, a.card) = T at s2 ⊢
  generalize A.card = m at hC1 hC3 s1 ⊢
  generalize S.card = n at hC2 s1
  have h5 : m ^ m * 2 ^ Z ≤ 2 ^ (n * m) := by
    calc m ^ m * 2 ^ Z ≤ _ := hC3
      _ ≤ (2 ^ n) ^ m := Nat.pow_le_pow_left hC2 m
      _ = 2 ^ (n * m) := by rw [← pow_mul]
  have hmm : 0 < m ^ m := one_le_self_pow m
  have h6 : (m ^ m * 2 ^ Z) ^ 2 ≤ (2 ^ (n * m)) ^ 2 := Nat.pow_le_pow_left h5 2
  have h7 : (2 ^ (n * m)) ^ 2 = 4 ^ X * 4 ^ Y := by
    rw [← pow_add, s1, ← pow_mul, show (4 : ℕ) = 2 ^ 2 by norm_num, ← pow_mul]
    congr 1
    ring
  have h8 : 4 ^ Y = 4 ^ Z * 4 ^ T := by rw [← pow_add, s2]
  have h4Z : (4 : ℕ) ^ Z = (2 ^ Z) ^ 2 := by
    rw [show (4 : ℕ) = 2 ^ 2 by norm_num, ← pow_mul, ← pow_mul, mul_comm]
  have h9 : (m ^ m * 2 ^ Z) ^ 2 = (m ^ m * 4 ^ Z) * m ^ m := by
    rw [h4Z]
    ring
  have h10 : (m ^ m * 4 ^ Z) * m ^ m ≤ (m ^ m * 4 ^ Z) * 4 ^ T := by
    calc (m ^ m * 4 ^ Z) * m ^ m = (m ^ m * 2 ^ Z) ^ 2 := h9.symm
      _ ≤ (2 ^ (n * m)) ^ 2 := h6
      _ = 4 ^ X * 4 ^ Y := h7
      _ ≤ m ^ m * 4 ^ Y := Nat.mul_le_mul_right _ hC1
      _ = (m ^ m * 4 ^ Z) * 4 ^ T := by rw [h8, mul_assoc]
  have h11 : m ^ m ≤ 4 ^ T := Nat.le_of_mul_le_mul_left h10 (by positivity)
  calc m ^ m ≤ 4 ^ T := h11
    _ = 2 ^ (2 * T) := by rw [show (4 : ℕ) = 2 ^ 2 by norm_num, ← pow_mul]

end Problem4

theorem problem4 {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hA : A.Nonempty)
    (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) :
    A.card ^ A.card ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := 
  Problem4.main A hA hunion

#print axioms problem4
