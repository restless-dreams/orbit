<map version="freeplane 1.11.5">
<!--To view this file, download free mind mapping software Freeplane from https://www.freeplane.org -->
<bookmarks/>
<node TEXT="Thesis" FOLDED="false" ID="ID_100" CREATED="1760000000000" MODIFIED="1760000000000"><hook NAME="MapStyle">
    <properties edgeColorConfiguration="#808080ff,#ff0000ff,#0000ffff" fit_to_viewport="false"/>
    <map_styles>
        <stylenode LOCALIZED_TEXT="styles.root_node" STYLE="oval" UNIFORM_SHAPE="true" VGAP_QUANTITY="24 pt">
            <font SIZE="24"/>
            <stylenode LOCALIZED_TEXT="styles.predefined" POSITION="bottom_or_right" STYLE="bubble">
                <stylenode LOCALIZED_TEXT="default" ID="ID_271890427" COLOR="#000000" STYLE="fork">
                    <richcontent TYPE="DETAILS" CONTENT-TYPE="plain/auto"/>
                    <richcontent TYPE="NOTE" CONTENT-TYPE="plain/auto"/>
                </stylenode>
                <stylenode LOCALIZED_TEXT="defaultstyle.note" COLOR="#000000" BACKGROUND_COLOR="#ffffff"/>
            </stylenode>
        </stylenode>
    </map_styles>
</hook>
<hook NAME="AutomaticEdgeColor" COUNTER="3" RULE="ON_BRANCH_CREATION"/>
<node TEXT="Chapter 1" POSITION="bottom_or_right" ID="ID_101" BACKGROUND_COLOR="#cce5ff" CREATED="1760000000000" MODIFIED="1760000000000">
<icon BUILTIN="emoji-1F4D6"/>
<icon BUILTIN="25%"/>
<edge COLOR="#ff0000"/>
<richcontent TYPE="DETAILS" CONTENT-TYPE="plain/auto"><text>Due in March</text></richcontent>
<richcontent TYPE="NOTE" CONTENT-TYPE="plain/markdown"><text>Read **Smith 2020** first.</text></richcontent>
<attribute NAME="Words" VALUE="4500"/>
<attribute NAME="Reviewer" VALUE="Ana"/>
<node TEXT="Section 1.1" ID="ID_102" CREATED="1760000000000" MODIFIED="1760000000000">
<arrowlink SHAPE="CUBIC_CURVE" COLOR="#000000" WIDTH="2" TRANSPARENCY="200" FONT_SIZE="9" FONT_FAMILY="SansSerif" DESTINATION="ID_104" MIDDLE_LABEL="builds on" STARTARROW="NONE" ENDARROW="DEFAULT"/>
</node>
<node TEXT="Figures" ID="ID_103" CREATED="1760000000000" MODIFIED="1760000000000">
<hook URI="figures/chart.png" SIZE="0.5" NAME="ExternalObject"/>
</node>
</node>
<node TEXT="Chapter 2" POSITION="bottom_or_right" ID="ID_104" CREATED="1760000000000" MODIFIED="1760000000000">
<icon BUILTIN="100%"/>
<icon BUILTIN="../my_own_icon"/>
<richcontent TYPE="NOTE" CONTENT-TYPE="xml/">
<html>
  <head>

  </head>
  <body>
    <p>
      Done &amp; dusted, see <a href="#ID_102">section 1.1</a>.
    </p>
  </body>
</html>
</richcontent>
<node TEXT="Free note" POSITION="top_or_left" ID="ID_105" CREATED="1760000000000" MODIFIED="1760000000000">
<hook NAME="FreeNode"/>
</node>
</node>
<node TEXT="Secrets" ID="ID_106" ENCRYPTED_CONTENT="QUJDREVGRw==" CREATED="1760000000000" MODIFIED="1760000000000"/>
<node TEXT="Cover" ID="ID_107" CREATED="1760000000000" MODIFIED="1760000000000">
<hook URI="https://example.com/cover.png" SIZE="1.0" NAME="ExternalObject"/>
</node>
</node>
</map>
